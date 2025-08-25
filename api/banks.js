// 檔案路徑: /api/banks.js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY); // 使用 anon key 即可
export default async function handler(req, res) {
  try {
    const { data, error } = await supabase.from('banks').select('bank_name').order('created_at');
    if (error) throw error;
    res.status(200).json(data.map(b => b.bank_name));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}