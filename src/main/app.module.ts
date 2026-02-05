import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './controllers/app.controller';
import { AppService } from './services/app.service';
import { UsersModule } from 'src/users/users.module';
import { AuthModule } from 'src/auth/auth.module';
import { SupabaseModule } from 'src/db/supabase.module';
import { GoogleDriveModule } from 'src/drive/drive.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SupabaseModule,
    UsersModule,
    AuthModule,
    GoogleDriveModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
