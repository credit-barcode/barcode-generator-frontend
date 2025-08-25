// 檔案路徑: /api/banks.js

// 從 Supabase 函式庫中匯入建立連線的工具
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 連線
// 注意：獲取銀行列表是一個公開操作，不需要高權限的 service_role key。
// 為了安全，我們使用權限較低的 anon (public) key。
// 這兩個金鑰都應該儲存在 Vercel 的環境變數中。
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY; // 【注意】使用 anon key

// 建立一個 Supabase 的連線客戶端
const supabase = createClient(supabaseUrl, supabaseKey);

// 這是 Vercel Serverless Function 的標準寫法
export default async function handler(request, response) {
  // 步驟 1: 確保此 API 只接受 GET 請求
  if (request.method !== 'GET') {
    // 如果不是 GET 請求，回傳 405 Method Not Allowed
    response.setHeader('Allow', ['GET']);
    return response.status(405).json({ message: `不支援此請求方法：${request.method}` });
  }

  try {
    // 步驟 2: 從 Supabase 的 'banks' 資料表中查詢 'bank_name' 欄位
    const { data, error } = await supabase
      .from('banks')
      .select('bank_name')
      .order('created_at', { ascending: true }); // 按照您在 Supabase 中新增的順序進行排序

    // 如果資料庫查詢過程中發生錯誤，就拋出錯誤
    if (error) {
      throw error;
    }

    // 步驟 3: Supabase 回傳的 data 是一個物件陣列，例如: [{ bank_name: '銀行A' }, { bank_name: '銀行B' }]
    // 我們使用 .map() 將它轉換成前端需要的、一個單純的字串陣列: ['銀行A', '銀行B']
    const bankNames = data.map(item => item.bank_name);
    
    // 步驟 4: 查詢成功，回傳狀態碼 200 OK 和銀行名稱的 JSON 陣列
    return response.status(200).json(bankNames);

  } catch (error) {
    // 步驟 5: 統一處理所有可能發生的錯誤
    console.error('獲取銀行列表 API 錯誤:', error);
    return response.status(500).json({ error: "獲取銀行列表失敗：" + error.message });
  }
}