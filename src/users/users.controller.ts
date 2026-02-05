import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PublicUser } from './types/public-user.type';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() dto: CreateUserDto): Promise<PublicUser> {
    return await this.usersService.create(dto);
  }

  @Get()
  async findAll(): Promise<PublicUser[]> {
    return await this.usersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PublicUser | null> {
    return await this.usersService.findOne(+id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<PublicUser | null> {
    return await this.usersService.update(+id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<boolean> {
    return await this.usersService.remove(+id);
  }
}
