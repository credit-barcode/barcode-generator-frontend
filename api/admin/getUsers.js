// 檔案路徑: /api/admin/getUsers.js (修正版)

import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    const { user, error: authError } = await verifyAdmin(request.headers);
    if (authError) {
      return response.status(authError.status).json({ message: authError.message });
    }

    // ▼▼▼ 【核心修正】將 select() 中的 'qr_permission' 改為 'permission' ▼▼▼
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, account, email, login_count, last_login, current_quota, reset_quota, register_date, is_verified, is_admin, permission')
      .order('created_at', { ascending: false });
    // ▲▲▲ 【核心修正】 ▲▲▲

    if (fetchError) {
      throw fetchError;
    }
    
    return response.status(200).json(users);

  } catch (error) {
    console.error('獲取使用者列表 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}