// 檔案路徑: /api/resendCode.js

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { account } = request.body;
    if (!account) {
      return response.status(400).json({ message: '缺少帳號參數。' });
    }

    // 1. 找到這位尚未驗證的使用者
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('email, is_verified')
      .eq('account', account)
      .single();

    if (fetchError || !userData) {
      return response.status(404).json({ message: '找不到此帳號。' });
    }
    if (userData.is_verified) {
        return response.status(400).json({ message: '此帳號已驗證，無需重複操作。' });
    }

    // 2. 產生新的驗證碼和過期時間
    const newVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newExpiresAt = new Date(new Date().getTime() + 10 * 60 * 1000);

    // 3. 更新資料庫
    const { error: updateError } = await supabase
      .from('users')
      .update({
        verify_code: newVerifyCode,
        verify_expires: newExpiresAt
      })
      .eq('account', account);

    if (updateError) throw updateError;
    
    // 4. 寄送新的驗證郵件
    await resend.emails.send({
      from: 'Barcode App <onboarding@resend.dev>',
      to: [userData.email],
      subject: '您的新條碼產生器驗證碼',
      html: `<p>您的【新】驗證碼是：<strong>${newVerifyCode}</strong></p><p>此驗證碼將在 10 分鐘後失效。</p>`,
    });

    return response.status(200).json({ success: true, message: '新的驗證碼已寄送到您的信箱。' });

  } catch (error) {
    console.error('重新寄送驗證碼 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}