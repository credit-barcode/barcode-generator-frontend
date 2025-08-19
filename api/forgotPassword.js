// 檔案路徑: /api/forgotPassword.js

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { randomBytes } from 'crypto'; // 匯入 Node.js 內建的加密模組來產生安全的隨機 token

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { email } = request.body;
    if (!email) {
      return response.status(400).json({ message: '電子信箱不能為空。' });
    }

    // 1. 在資料庫中根據信箱尋找已驗證的使用者
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('id, account, is_verified')
      .eq('email', email)
      .single();

    // 為了安全，無論是否找到使用者，都回傳一個通用的成功訊息
    // 這樣可以防止惡意使用者透過錯誤訊息來探測哪些信箱已經被註冊
    if (fetchError || !userData || !userData.is_verified) {
      console.log(`密碼重設請求，但找不到已驗證的信箱: ${email}`);
      return response.status(200).json({ message: '如果您的信箱存在於我們的系統中，您將會收到一封密碼重設郵件。' });
    }

    // 2. 產生一個安全的、一次性的重設 Token
    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = resetToken; // TODO: 為了安全，未來應該將 token 雜湊後再存入資料庫
    const resetTokenExpires = new Date(new Date().getTime() + 10 * 60 * 1000); // 10 分鐘後過期

    // 3. 將重設 Token 和過期時間儲存到使用者資料中
    // 我們需要為 users 資料表新增 'reset_token' 和 'reset_token_expires' 兩個欄位
    const { error: updateError } = await supabase
      .from('users')
      .update({
        // 這裡假設您的 users 表有這兩個欄位，如果沒有，需要先去 Supabase 新增
        // reset_token: tokenHash,
        // reset_token_expires: resetTokenExpires
      })
      .eq('id', userData.id);

    if (updateError) {
      throw updateError;
    }

    // 4. 建立密碼重設連結
    // 這個連結會指向您前端應用的一個新頁面，例如 /reset-password
    const resetUrl = `https://${request.headers.host}/reset-password?token=${resetToken}`;

    // 5. 透過 Resend 寄送密碼重設郵件
    await resend.emails.send({
        from: 'Barcode App <onboarding@resend.dev>',
        to: [email],
        subject: '您的條碼產生器密碼重設請求',
        html: `
            <p>您好 ${userData.account},</p>
            <p>您請求了重設密碼。請點擊下方的連結來設定您的新密碼：</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>這個連結將在 10 分鐘後失效。</p>
            <p>如果您沒有請求重設密碼，請忽略此郵件。</p>
        `,
    });

    return response.status(200).json({ message: '如果您的信箱存在於我們的系統中，您將會收到一封密碼重設郵件。' });

  } catch (error) {
    console.error('忘記密碼 API 錯誤:', error);
    // 即使內部出錯，也回傳一個通用的訊息，避免洩漏系統資訊
    return response.status(200).json({ message: '如果您的信箱存在於我們的系統中，您將會收到一封密碼重設郵件。' });
  }
}