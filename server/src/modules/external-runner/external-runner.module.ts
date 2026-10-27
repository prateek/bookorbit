import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { externalRunnerConfig } from './external-runner.config';
import { ExternalRunnerController } from './external-runner.controller';
import { ExternalRunnerService } from './external-runner.service';
import { RunnerRepository } from './runner.repository';
import { RunnerCredentialsService } from './runner-credentials.service';
import { RunnerClientService } from './runner-client.service';

@Module({
  imports: [ConfigModule.forFeature(externalRunnerConfig)],
  controllers: [ExternalRunnerController],
  providers: [ExternalRunnerService, RunnerRepository, RunnerCredentialsService, RunnerClientService],
})
export class ExternalRunnerModule {}
