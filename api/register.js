// 檔案路徑: /api/register.js

// 從 Supabase 和 Resend 函式庫中匯入必要的工具
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// 讀取 Vercel 環境變數並初始化服務
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const resendApiKey = process.env.RESEND_API_KEY;
const resend = new Resend(resendApiKey);

// 這是 Vercel Serverless Function 的標準寫法
export default async function handler(request, response) {
  // 步驟 0: 檢查請求方法，只允許 POST
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 從前端請求的 body 中獲取使用者提交的資料
    const { username, password, email, serial } = request.body;

    // 步驟 1: 驗證輸入資料的完整性
    if (!username || !password || !email || !serial) {
      return response.status(400).json({ result: 'validation_error', message: '所有欄位皆為必填。' });
    }

    // 步驟 2: 驗證註冊碼的有效性
    // 從 'serials' 資料表中尋找符合的註冊碼
    const { data: serialData, error: serialError } = await supabase
      .from('serials')
      .select('id, total_limit, used_count')
      .eq('serial_code', serial)
      .single(); // .single() 確保只找到一筆或零筆資料

    // 如果找不到註冊碼或查詢出錯
    if (serialError || !serialData) {
      return response.status(400).json({ result: 'invalid_serial', message: '註冊碼無效或不存在。' });
    }
    // 如果註冊碼已達使用上限
    if (serialData.used_count >= serialData.total_limit) {
      return response.status(400).json({ result: 'serial_full', message: '此註冊碼已達使用上限。' });
    }

    // 步驟 3: 檢查帳號 (account) 或信箱 (email) 是否已被註冊
    // 使用 or() 條件，查詢 users 表中是否有任何一筆資料的 account 或 email 與輸入的相符
    const { data: existingUsers, error: checkUserError } = await supabase
        .from('users')
        .select('account, email')
        .or(`account.eq.${username},email.eq.${email}`);

    // 如果查詢過程出錯，直接拋出
    if (checkUserError) {
        throw checkUserError;
    }

    // 如果找到了已存在的用戶
    if (existingUsers && existingUsers.length > 0) {
        // 為了提供更精確的錯誤訊息，我們檢查是哪個欄位重複了
        if (existingUsers.some(u => u.account === username)) {
            return response.status(400).json({ result: 'user_exists', message: '此帳號已被註冊。' });
        }
        if (existingUsers.some(u => u.email === email)) {
            return response.status(400).json({ result: 'email_exists', message: '此信箱已被註冊。' });
        }
    }
    
    // 步驟 4: 產生驗證碼並準備新使用者資料
    const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(new Date().getTime() + 10 * 60 * 1000); // 10 分鐘後過期
    
    // TODO: 密碼安全升級。未來應使用 bcrypt.js 等函式庫將密碼雜湊後再儲存
    const storedPassword = password; // 暫時使用明文密碼儲存

    // 步驟 5: 將新使用者資料（包含驗證碼）插入到 users 資料表
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        { 
          account: username, 
          password: storedPassword,
          email: email,
          verify_code: verifyCode,      // 將產生的驗證碼一起寫入
          verify_expires: expiresAt,    // 將過期時間一起寫入
          is_verified: false          // 確保新用戶是未驗證狀態
        },
      ])
      .select();

    // 如果插入資料庫時發生錯誤，拋出錯誤
    if (insertError) {
      throw insertError;
    }

    // 步驟 6: 更新註冊碼的使用次數
    const { error: updateSerialError } = await supabase
      .from('serials')
      .update({ used_count: serialData.used_count + 1 })
      .eq('id', serialData.id);

    // 如果更新註冊碼失敗，這不是一個阻斷性錯誤。我們在後台記錄它，但仍然繼續寄信流程。
    if (updateSerialError) {
      console.error('更新註冊碼次數失敗:', updateSerialError);
    }
    
    // 步驟 7: 使用 Resend 寄送驗證郵件
    const { data, error: mailError } = await resend.emails.send({
        from: 'Barcode App <onboarding@resend.dev>', // 來自 Resend 的預設寄件地址
        to: [email],
        subject: '您的條碼產生器驗證碼',
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
              <h2>請驗證您的電子信箱</h2>
              <p>感謝您的註冊！您的驗證碼是：</p>
              <p style="font-size: 28px; font-weight: bold; letter-spacing: 5px; background: #f0f0f0; padding: 10px; border-radius: 5px;">
                ${verifyCode}
              </p>
              <p>此驗證碼將在 10 分鐘後失效。</p>
            </div>
        `,
    });

    // 如果寄送郵件失敗，拋出錯誤
    if (mailError) {
      // 這裡可以考慮是否要刪除剛剛建立的使用者，以保持資料一致性
      console.error('Resend 寄送郵件失敗:', mailError);
      throw new Error('無法寄送驗證郵件。');
    }

    // 步驟 8: 所有操作成功，回傳成功訊息給前端
    return response.status(200).json({ result: 'success_pending_verification' });

  } catch (error) {
    // 統一的錯誤處理區塊，捕捉整個流程中任何一個環節的失敗
    console.error('註冊 API 錯誤:', error);
    // 回傳通用的 500 伺服器錯誤，並附上錯誤訊息
    return response.status(500).json({ result: 'server_error', message: error.message });
  }
}