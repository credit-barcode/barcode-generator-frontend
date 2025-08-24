// 檔案路徑: /api/admin/getUsers.js
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    const { error: authError } = await verifyAdmin(request.headers);
    if (authError) return response.status(authError.status).json({ message: authError.message });

    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, account, permission, current_quota, reset_quota, register_date')
      .order('created_at', { ascending: false });
    if (fetchError) throw fetchError;
    
    return response.status(200).json(users);
  } catch (error) {
    return response.status(500).json({ message: "獲取使用者列表失敗: " + error.message });
  }
}