// 檔案路徑: /api/admin/users.js
// 處理所有 /api/admin/users 的請求
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  const { user, error } = await verifyAdmin(request.headers);
  if (error) return response.status(error.status).json({ message: error.message });

  if (request.method === 'GET') {
    const { data, error: fetchError } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (fetchError) return response.status(500).json({ message: fetchError.message });
    return response.status(200).json(data);
  } else if (request.method === 'POST') {
    const { id, ...updateFields } = request.body;

    // 增加型別檢查和日誌記錄
    console.log('接收到的資料:', request.body);
    if (!id) {
      console.error('缺少 id');
      return response.status(400).json({ message: '缺少 id' });
    }

    if (typeof id !== 'string') {
      console.warn('id 不是字串型別，嘗試轉換');
      updateFields.id = String(id);
    }

    const { error: updateError } = await supabase.from('users').update(updateFields).eq('id', id);
    if (updateError) {
      console.error('更新失敗:', updateError);
      return response.status(500).json({ message: updateError.message });
    }

    return response.status(200).json({ success: true });
  } else {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }
}
