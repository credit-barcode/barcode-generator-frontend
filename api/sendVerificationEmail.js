// 檔案路徑: /api/sendVerificationEmail.js

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// 初始化 Supabase 和 Resend 的連線
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { email, account } = request.body;
    if (!email || !account) {
      return response.status(400).json({ message: '缺少 email 或 account 參數。' });
    }

    // 1. 產生一個隨機的 6 位數驗證碼
    const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 2. 設定驗證碼的過期時間 (例如 10 分鐘後)
    const expiresAt = new Date(new Date().getTime() + 10 * 60 * 1000); // 10 minutes from now

    // 3. 將驗證碼和過期時間更新到 Supabase 的 users 表中
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        verify_code: verifyCode,
        verify_expires: expiresAt
      })
      .eq('account', account); // 根據帳號找到對應的使用者

    if (updateError) {
      console.error('儲存驗證碼失敗:', updateError);
      throw new Error('無法在資料庫中儲存驗證碼。');
    }

    // 4. 使用 Resend 寄送驗證郵件
    // from: 如果您驗證了自有網域，可以使用像 'noreply@yourdomain.com' 這樣的地址
    // 暫時我們先使用 Resend 提供的預設地址
    const { data, error: mailError } = await resend.emails.send({
      from: 'Acme <onboarding@resend.dev>', // Resend 提供的預設寄件人
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

    // 5. 回傳成功訊息
    return response.status(200).json({ success: true, message: '驗證信已寄出。' });

  } catch (error) {
    console.error('寄送驗證信 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}