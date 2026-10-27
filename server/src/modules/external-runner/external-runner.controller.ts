import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { AuditAction, AuditResource, Permission } from '@bookorbit/types';
import { Auditable } from '../../common/decorators/auditable.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { ExternalRunnerService } from './external-runner.service';
import { CancelRunnerDto, RunnerPageDto, SaveRunnerDto, StartRunnerDto } from './dto/runner.dto';

@Controller('external-runners')
@RequirePermission(Permission.ManageLibraries)
export class ExternalRunnerController {
  constructor(private readonly service: ExternalRunnerService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() page: RunnerPageDto) {
    const after = page.cursor && /^\d+$/.test(page.cursor) ? Number(page.cursor) : 0;
    return this.service.list(user.id, Number.isSafeInteger(after) ? after : 0);
  }
  @Post()
  @RequirePermission(Permission.ManageLibraries, Permission.ManageAppSettings)
  @Auditable({
    action: AuditAction.ExternalRunnerCreate,
    resource: AuditResource.ExternalRunner,
    description: 'External runner create',
    getResourceId: (req) => (req.params.id ? Number(req.params.id) : undefined),
  })
  create(@CurrentUser() user: RequestUser, @Body() dto: SaveRunnerDto) {
    return this.service.save(user.id, dto);
  }
  @Put(':id')
  @RequirePermission(Permission.ManageLibraries, Permission.ManageAppSettings)
  @Auditable({
    action: AuditAction.ExternalRunnerUpdate,
    resource: AuditResource.ExternalRunner,
    description: 'External runner update',
    getResourceId: (req) => (req.params.id ? Number(req.params.id) : undefined),
  })
  update(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SaveRunnerDto) {
    return this.service.save(user.id, dto, id);
  }
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(Permission.ManageLibraries, Permission.ManageAppSettings)
  @Auditable({
    action: AuditAction.ExternalRunnerDelete,
    resource: AuditResource.ExternalRunner,
    description: 'External runner remove',
    getResourceId: (req) => (req.params.id ? Number(req.params.id) : undefined),
  })
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id, user.id);
  }
  @Get(':id/capabilities')
  describe(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.describe(id, user.id);
  }
  @Get(':id/runs')
  runs(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Query() page: RunnerPageDto) {
    return this.service.runs(id, user.id, page);
  }
  @Get(':id/runs/:runId')
  run(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Param('runId') runId: string) {
    return this.service.run(id, user.id, runId);
  }
  @Get(':id/runs/:runId/events')
  events(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Param('runId') runId: string, @Query() page: RunnerPageDto) {
    return this.service.events(id, user.id, runId, page);
  }
  @Post(':id/runs')
  @HttpCode(202)
  @Auditable({
    action: AuditAction.ExternalRunnerStart,
    resource: AuditResource.ExternalRunner,
    description: 'External runner start',
    getResourceId: (req) => (req.params.id ? Number(req.params.id) : undefined),
  })
  start(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StartRunnerDto) {
    return this.service.start(id, user.id, dto);
  }
  @Post(':id/runs/:runId/cancel')
  @HttpCode(202)
  @Auditable({
    action: AuditAction.ExternalRunnerCancel,
    resource: AuditResource.ExternalRunner,
    description: 'External runner cancel',
    getResourceId: (req) => (req.params.id ? Number(req.params.id) : undefined),
  })
  cancel(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Param('runId') runId: string, @Body() dto: CancelRunnerDto) {
    return this.service.cancel(id, user.id, runId, dto.idempotencyKey);
  }
}
