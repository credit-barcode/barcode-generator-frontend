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
    // 使用 Supabase 客戶端從 'banks' 資料表中查詢 'bank_name' 欄位
    // .order() 是為了讓回傳的列表按名稱排序
    const { data, error } = await supabase
      .from('banks')
      .select('bank_name')
      .order('bank_name', { ascending: true });

    // 如果查詢過程中發生錯誤，就拋出錯誤
    if (error) {
      throw error;
    }

    // Supabase 回傳的 data 是一個物件陣列，像這樣: [{ bank_name: '台北富邦' }, { bank_name: '國泰世華' }]
    // 我們需要將它轉換成一個單純的字串陣列: ['台北富邦', '國泰世華']
    const bankNames = data.map(item => item.bank_name);
    
    // 查詢成功，回傳 200 OK 狀態碼和銀行名稱的 JSON 陣列
    return response.status(200).json(bankNames);

  } catch (error) {
    // 如果 try 區塊中發生任何錯誤，就在這裡捕捉
    // 回傳 500 Internal Server Error 狀態碼和錯誤訊息
    return response.status(500).json({ error: error.message });
  }
}