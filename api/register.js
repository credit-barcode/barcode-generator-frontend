// 檔案路徑: /api/register.js

// 從 Supabase、Resend 和 bcryptjs 函式庫中匯入必要的工具
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import bcrypt from 'bcryptjs';

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
    // 步驟 1: 從前端請求的 body 中獲取使用者提交的資料
    const { username, password, email, serial } = request.body;

    // 步驟 2: 驗證輸入資料的完整性
    if (!username || !password || !email || !serial) {
      return response.status(400).json({ result: 'validation_error', message: '所有欄位皆為必填。' });
    }

    // 步驟 3: 驗證註冊碼的有效性
    const { data: serialData, error: serialError } = await supabase
      .from('serials')
      .select('id, total_limit, used_count')
      .eq('serial_code', serial)
      .single();

    if (serialError || !serialData) {
      return response.status(400).json({ result: 'invalid_serial', message: '註冊碼無效或不存在。' });
    }
    if (serialData.used_count >= serialData.total_limit) {
      return response.status(400).json({ result: 'serial_full', message: '此註冊碼已達使用上限。' });
    }

    // 步驟 4: 檢查帳號 (account) 或信箱 (email) 是否已被註冊
    const { data: existingUsers, error: checkUserError } = await supabase
        .from('users')
        .select('account, email')
        .or(`account.eq.${username},email.eq.${email}`);

    if (checkUserError) {
        throw checkUserError;
    }

    if (existingUsers && existingUsers.length > 0) {
        if (existingUsers.some(u => u.account === username)) {
            return response.status(400).json({ result: 'user_exists', message: '此帳號已被註冊。' });
        }
        if (existingUsers.some(u => u.email === email)) {
            return response.status(400).json({ result: 'email_exists', message: '此信箱已被註冊。' });
        }
    }
    
    // 步驟 5: 【核心安全升級】對使用者密碼進行雜湊加密
    // 使用 bcrypt.hash 進行非同步加密。第二個參數 (saltRounds) 推薦設為 10，
    // 這個數字代表加密的複雜度，越高越安全，但耗時也越長。10 是一個很好的平衡點。
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 步驟 6: 產生驗證碼並準備新使用者資料
    const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(new Date().getTime() + 10 * 60 * 1000); // 10 分鐘後過期

    // 步驟 7: 將新使用者資料（包含【雜湊後的密碼】和驗證碼）插入到 users 資料表
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        { 
          account: username, 
          password: hashedPassword, // 【核心修正】儲存加密後的密碼，而不是原始密碼
          email: email,
          verify_code: verifyCode,
          verify_expires: expiresAt,
          is_verified: false
        },
      ])
      .select();

    if (insertError) {
      throw insertError;
    }

    // 步驟 8: 更新註冊碼的使用次數
    const { error: updateSerialError } = await supabase
      .from('serials')
      .update({ used_count: serialData.used_count + 1 })
      .eq('id', serialData.id);

    if (updateSerialError) {
      console.error('更新註冊碼次數失敗:', updateSerialError);
    }
    
    // 步驟 9: 使用 Resend 寄送驗證郵件
    const { data, error: mailError } = await resend.emails.send({
        from: 'Barcode App <onboarding@resend.dev>',
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

    if (mailError) {
      console.error('Resend 寄送郵件失敗:', mailError);
      throw new Error('無法寄送驗證郵件。');
    }

    // 步驟 10: 所有操作成功，回傳成功訊息給前端
    return response.status(200).json({ result: 'success_pending_verification' });

  } catch (error) {
    // 統一的錯誤處理區塊
    console.error('註冊 API 錯誤:', error);
    return response.status(500).json({ result: 'server_error', message: error.message });
  }
}