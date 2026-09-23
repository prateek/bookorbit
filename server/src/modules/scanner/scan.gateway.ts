import { Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';

import type {
  AuthenticationMethod,
  BookMissingEvent,
  BookMovedEvent,
  BookProgressChangedEvent,
  BookRestoredEvent,
  BookTransferredEvent,
  CoverRefreshedEvent,
  CoverRefreshProgressEvent,
  ScanBooksAddedEvent,
  ScanProgressEvent,
} from '@bookorbit/types';
import { AuthService } from '../auth/auth.service';
import {
  ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED,
  AchievementEventsService,
  type BookProgressChangedPayload,
} from '../achievement/achievement-events.service';
import { ScanJobStore } from './scan-job-store.service';
import { ScannerRepository } from './scanner.repository';
import { rejectSocketConnection } from '../../common/utils/ws-auth.utils';

type SocketUser = { id: number; isSuperuser: boolean };

@WebSocketGateway({ namespace: '/scan', cors: { credentials: true } })
export class ScanGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ScanGateway.name);
  private readonly clientOrigin: string;
  private readonly handleBookProgressChanged = (payload: BookProgressChangedPayload): void => {
    this.emitBookProgressChanged(payload);
  };
  // Socket.IO delivers messages while handleConnection is still verifying the token, so a
  // subscription waits on the same verification instead of reading a user that is not set yet.
  private readonly socketUsers = new WeakMap<Socket, Promise<SocketUser | null>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly scanJobStore: ScanJobStore,
    private readonly achievementEvents: AchievementEventsService,
    private readonly scannerRepo: ScannerRepository,
    config: ConfigService,
  ) {
    this.clientOrigin = config.get<string>('app.appUrl') ?? 'http://localhost:5173';
  }

  onModuleInit(): void {
    this.achievementEvents.on(ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED, this.handleBookProgressChanged);
  }

  onModuleDestroy(): void {
    this.achievementEvents.removeListener(ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED, this.handleBookProgressChanged);
  }

  afterInit(server: Server): void {
    if (!server.engine?.opts) return;
    server.engine.opts.cors = {
      ...(server.engine.opts.cors ?? {}),
      origin: this.clientOrigin,
      credentials: true,
    };
  }

  async handleConnection(client: Socket): Promise<void> {
    const authentication = this.authenticate(client);
    this.socketUsers.set(
      client,
      authentication.then(
        (user) => user,
        () => null,
      ),
    );
    try {
      const user = await authentication;
      await client.join(`user:${user.id}`);
      this.logger.debug(`[scanner.ws_connection] [start] userId=${user.id} socketId=${client.id} - websocket connected`);
    } catch (err) {
      this.logger.warn(
        `[scanner.ws_connection] [fail] socketId=${client.id} errorClass=${err instanceof Error ? err.name : 'Error'} error="${sanitizeLogValue(err instanceof Error ? err.message : String(err))}" - websocket rejected`,
      );
      rejectSocketConnection(client, err);
    }
  }

  private async authenticate(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) throw new UnauthorizedException('No token provided');
    const payload = this.jwtService.verify<{ sub: number; ver: number; sid?: number; amr?: AuthenticationMethod }>(token, {
      algorithms: ['HS256'],
    });
    const user = await this.authService.validateSessionUser(payload.sub, payload.ver, payload.amr ?? 'legacy', payload.sid);
    if (!user) throw new UnauthorizedException('User not found or token revoked');
    (client.data as Record<string, unknown>).user = user;
    return user;
  }

  private async canAccessLibrary(user: SocketUser, libraryId: number): Promise<boolean> {
    if (user.isSuperuser) return true;
    const userIds = await this.scannerRepo.findLibraryAccessibleUserIds(libraryId);
    return userIds.includes(user.id);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`[scanner.ws_connection] [end] socketId=${client.id} - websocket disconnected`);
  }

  /**
   * Library rooms carry book titles and scan progress, so joining one takes the same library
   * access a controller would demand. A refused subscription is logged and dropped.
   */
  @SubscribeMessage('subscribe:library')
  async handleSubscribeLibrary(client: Socket, rawLibraryId: unknown): Promise<void> {
    const startedAt = Date.now();
    const libraryId = typeof rawLibraryId === 'number' || typeof rawLibraryId === 'string' ? Number(rawLibraryId) : Number.NaN;
    const user = await this.socketUsers.get(client);
    let allowed: boolean;
    try {
      allowed = !!user && Number.isSafeInteger(libraryId) && libraryId > 0 && (await this.canAccessLibrary(user, libraryId));
    } catch (err) {
      this.logger.warn(
        `[scanner.ws_subscribe] [fail] userId=${user?.id ?? 0} libraryId=${libraryId} socketId=${client.id} durationMs=${Date.now() - startedAt} errorClass=${err instanceof Error ? err.name : 'Error'} error="${sanitizeLogValue(err instanceof Error ? err.message : String(err))}" - library access check failed`,
      );
      return;
    }
    if (!allowed) {
      this.logger.warn(
        `[scanner.ws_subscribe] [fail] userId=${user?.id ?? 0} libraryId=${libraryId} socketId=${client.id} durationMs=${Date.now() - startedAt} errorClass=ForbiddenException error="library access denied" - library subscription rejected`,
      );
      return;
    }

    await client.join(`library:${libraryId}`);
    // Send current snapshot immediately so reconnecting clients catch up.
    const entry = this.scanJobStore.get(libraryId);
    if (entry) {
      const event: ScanProgressEvent = {
        jobId: entry.jobId,
        libraryId,
        status: 'running',
        processed: entry.processed,
        total: entry.total,
        added: entry.added,
        updated: entry.updated,
        missing: entry.missing,
      };
      client.emit('scan:progress', event);
    }
  }

  // Called by services — not WS message handlers. Guards against script/test
  // contexts where no HTTP adapter starts and this.server is never populated.
  emitProgress(event: ScanProgressEvent): void {
    this.server?.to(`library:${event.libraryId}`).emit('scan:progress', event);
  }

  emitCoverRefreshProgress(event: CoverRefreshProgressEvent): void {
    this.server?.to(`library:${event.libraryId}`).emit('cover:refresh:progress', event);
  }

  emitCoverRefreshed(event: CoverRefreshedEvent): void {
    this.server?.to(`library:${event.libraryId}`).emit('cover:refreshed', event);
  }

  emitBookMissing(event: BookMissingEvent): void {
    this.logger.debug(`[scanner.ws_emit] [book:missing] libraryId=${event.libraryId} bookCount=${event.bookIds.length}`);
    this.server?.to(`library:${event.libraryId}`).emit('book:missing', event);
  }

  emitBookRestored(event: BookRestoredEvent): void {
    this.logger.debug(`[scanner.ws_emit] [book:restored] libraryId=${event.libraryId} bookCount=${event.bookIds.length}`);
    this.server?.to(`library:${event.libraryId}`).emit('book:restored', event);
  }

  emitBookMoved(event: BookMovedEvent): void {
    this.logger.debug(`[scanner.ws_emit] [book:moved] libraryId=${event.libraryId} bookCount=${event.bookIds.length}`);
    this.server?.to(`library:${event.libraryId}`).emit('book:moved', event);
  }

  emitBookTransferred(event: BookTransferredEvent): void {
    this.logger.debug(
      `[scanner.ws_emit] [book:transferred] fromLibraryId=${event.fromLibraryId} toLibraryId=${event.toLibraryId} bookCount=${event.bookIds.length}`,
    );
    this.server?.to([`library:${event.fromLibraryId}`, `library:${event.toLibraryId}`]).emit('book:transferred', event);
  }

  emitBookProgressChanged(payload: BookProgressChangedPayload): void {
    const event: BookProgressChangedEvent = {
      bookId: payload.bookId,
      progress: payload.progress,
      source: payload.source,
    };
    this.server?.to(`user:${payload.userId}`).emit('book:progress-changed', event);
  }

  emitBooksAdded(event: ScanBooksAddedEvent): void {
    this.server?.to(`library:${event.libraryId}`).emit('scan:books:added', event);
  }
}
