import { Controller, Get, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from 'src/db/supabase.provider';

@Controller()
export class AppController {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  @Get('health')
  async dbHealth() {
    const { data, error } = await this.supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, rows: data.length };
  }
}
