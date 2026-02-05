import { Module } from '@nestjs/common';
import { GoogleDriveController } from './drive.controller';
import { GoogleDriveService } from './drive.service';

@Module({
  providers: [GoogleDriveService],
  controllers: [GoogleDriveController],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
