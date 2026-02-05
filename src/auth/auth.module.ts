import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';
import { AuthService } from './auth.service';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: 'super-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
