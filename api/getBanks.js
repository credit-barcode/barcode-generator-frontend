// 檔案路徑: /api/getBanks.js

import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  try {
    const { data, error } = await supabase
      .from('banks')
      .select('bank_name')
      .order('created_at', { ascending: true }); // 按建立时间排序
    if (error) throw error;
    const bankNames = data.map(item => item.bank_name);
    return response.status(200).json(bankNames);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}