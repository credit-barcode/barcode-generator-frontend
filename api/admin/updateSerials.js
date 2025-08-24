// 檔案路徑: /api/admin/updateSerials.js
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ message: 'Method Not Allowed' });
  try {
    const { error: authError } = await verifyAdmin(request.headers);
    if (authError) return response.status(authError.status).json({ message: authError.message });
    
    const serialsData = request.body;
    if (!Array.isArray(serialsData)) return response.status(400).json({ message: '未提供有效的更新資料。' });

    // 刪除所有舊資料
    const { error: deleteError } = await supabase.from('serials').delete().neq('id', 0);
    if (deleteError) throw deleteError;

    // 插入新資料 (如果有的話)
    if (serialsData.length > 0) {
      const cleanSerialsData = serialsData.map(({ serial_code, total_limit, used_count }) => ({ serial_code, total_limit, used_count }));
      const { error: insertError } = await supabase.from('serials').insert(cleanSerialsData);
      if (insertError) throw insertError;
    }
    
    return response.status(200).json({ success: true, message: '註冊碼儲存成功！' });
  } catch (error) {
    return response.status(500).json({ message: "儲存註冊碼失敗: " + error.message });
  }
}