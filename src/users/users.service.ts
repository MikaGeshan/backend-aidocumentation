import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PublicUser } from './types/public-user.type';
import { User } from './entities/user.entity';
import { SUPABASE_CLIENT } from '../db/supabase.provider';

@Injectable()
export class UsersService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const { data, error } = await this.supabase
      .from('users')
      .insert({
        id: Date.now(),
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
      })
      .select('id, name, email')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('Email already exists');
      }
      throw error;
    }

    return data;
  }

  async findAll(): Promise<PublicUser[]> {
    const { data } = await this.supabase
      .from('users')
      .select('id, name, email');

    return data ?? [];
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) return null;
    return data as User | null;
  }

  async findOne(id: number): Promise<PublicUser | null> {
    const { data } = await this.supabase
      .from('users')
      .select('id, name, email')
      .eq('id', id)
      .single();

    return data ?? null;
  }

  async update(id: number, dto: UpdateUserDto): Promise<PublicUser | null> {
    const { data } = await this.supabase
      .from('users')
      .update(dto)
      .eq('id', id)
      .select('id, name, email')
      .single();

    return data ?? null;
  }

  async remove(id: number): Promise<boolean> {
    const { error } = await this.supabase.from('users').delete().eq('id', id);

    return !error;
  }
}
