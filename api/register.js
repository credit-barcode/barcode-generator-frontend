// 檔案路徑: /api/register.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 這是 Vercel Serverless Function 的標準寫法
export default async function handler(request, response) {
  // 為了安全，我們只接受 POST 請求
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 從前端請求的 body 中獲取使用者資料
    const { username, password, email, serial } = request.body;

    // 1. 驗證輸入資料是否存在
    if (!username || !password || !email || !serial) {
      // 使用 .status().json() 可以回傳帶有狀態碼的 JSON 錯誤訊息
      return response.status(400).json({ result: 'validation_error', message: '所有欄位皆為必填。' });
    }

    // 2. 驗證註冊碼 (serials 表)
    // 首先，從 'serials' 表中尋找符合的註冊碼
    const { data: serialData, error: serialError } = await supabase
      .from('serials')
      .select('id, total_limit, used_count')
      .eq('serial_code', serial)
      .single(); // .single() 表示我們預期只找到一筆或零筆資料

    if (serialError || !serialData) {
      return response.status(400).json({ result: 'invalid_serial', message: '註冊碼無效。' });
    }
    if (serialData.used_count >= serialData.total_limit) {
      return response.status(400).json({ result: 'serial_full', message: '此註冊碼已達使用上限。' });
    }

    // 3. 檢查帳號 (account) 或信箱 (email) 是否已被註冊 (users 表)
    // 我們使用 or() 條件，查詢 users 表中是否有任何一筆資料的 account 或 email 與輸入的相符
    const { data: existingUsers, error: checkUserError } = await supabase
        .from('users')
        .select('account, email')
        .or(`account.eq.${username},email.eq.${email}`);

    if (checkUserError) throw checkUserError;

    if (existingUsers && existingUsers.length > 0) {
        // 為了更精確的錯誤訊息，我們檢查是哪個欄位重複了
        if (existingUsers.some(u => u.account === username)) {
            return response.status(400).json({ result: 'user_exists', message: '此帳號已被註冊。' });
        }
        if (existingUsers.some(u => u.email === email)) {
            return response.status(400).json({ result: 'email_exists', message: '此信箱已被註冊。' });
        }
    }
    
    // 4. (重要！) 密碼雜湊 (Hashing)
    // 為了安全，絕不能將使用者的原始密碼直接存入資料庫。
    // 在這裡我們暫時先存明文，之後可以引入 bcrypt.js 來進行雜湊。
    // const hashedPassword = await bcrypt.hash(password, 10);
    const storedPassword = password; // 暫時使用明文密碼

    // 5. 將新使用者資料插入到 users 表
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        { 
          account: username, 
          password: storedPassword, // 應該存 hashedPassword
          email: email,
          // 其他欄位會使用您在 Supabase 中設定的預設值 (例如 is_verified: false)
        },
      ])
      .select();

    if (insertError) {
      // 如果插入失敗，拋出錯誤
      throw insertError;
    }

    // 6. 更新註冊碼的使用次數
    const { error: updateSerialError } = await supabase
      .from('serials')
      .update({ used_count: serialData.used_count + 1 })
      .eq('id', serialData.id);

    if (updateSerialError) {
      // 即使更新註冊碼失敗，使用者也已經建立了，所以我們只在後台記錄錯誤，不回傳給使用者
      console.error('更新註冊碼次數失敗:', updateSerialError);
    }
    
    // TODO: 寄送驗證信件的邏輯 (未來步驟)
    // 我們可以整合 Resend 或其他郵件服務來寄送驗證信

    // 7. 回傳成功訊息
    // 為了與您舊的邏輯保持一致，我們回傳 'success_pending_verification'
    return response.status(200).json({ result: 'success_pending_verification' });

  } catch (error) {
    // 統一的錯誤處理
    console.error('註冊 API 錯誤:', error);
    return response.status(500).json({ result: 'server_error', message: error.message });
  }
}