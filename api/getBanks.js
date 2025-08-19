// 檔案路徑: /api/getBanks.js

// 從 Supabase 函式庫中匯入建立連線的工具
import { createClient } from '@supabase/supabase-js';

// 讀取我們在 Vercel 中設定好的安全環境變數
// process.env.SUPABASE_URL 和 process.env.SUPABASE_SERVICE_KEY
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// 建立一個 Supabase 的連線客戶端
const supabase = createClient(supabaseUrl, supabaseKey);

// 這是 Vercel Serverless Function 的標準寫法
export default async function handler(request, response) {
  try {
    const { data, error } = await supabase
      .from('banks')
      .select('bank_name')
      // ▼▼▼ 【核心修正】將排序依據改為 created_at ▼▼▼
      .order('created_at', { ascending: true }); 
      // ▲▲▲ 【核心修正】 ▲▲▲

    if (error) {
      throw error;
    }
    const bankNames = data.map(item => item.bank_name);
    return response.status(200).json(bankNames);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}