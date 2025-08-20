// 檔案路徑: /api/forgotPassword.js

// 檔案路徑: /api/forgotPassword.js
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
    const { email } = request.body; // 我們只根據信箱來查找
    if (!email) {
      return response.status(400).json({ message: '電子信箱不能為空。' });
    }
    
    const { data: userData, error } = await supabase
      .from('users')
      .select('account, password') // 這裡只 select 了 password，但我們並不會用它
      .eq('email', email)
      .eq('is_verified', true) // 只找已驗證的用戶
      .single();

    // 為了安全，無論是否找到，都回傳通用訊息
    if (error || !userData) {
      console.log(`密碼提示請求，但找不到已驗證的信箱: ${email}`);
      return response.status(200).json({ message: '如果您的信箱存在於我們的系統中，您將會收到一封提示郵件。' });
    }
    
    // 因為密碼已加密，我們無法給出提示。所以我們寄送一個重設密碼的引導郵件。
    await resend.emails.send({
        from: 'Barcode App <onboarding@resend.dev>',
        to: [email],
        subject: '您的條碼產生器帳戶協助',
        html: `
            <p>您好 ${userData.account},</p>
            <p>我們收到了您請求帳戶協助的申請。</p>
            <p>由於系統安全升級，我們不再提供密碼提示。如果您忘記了密碼，請回到登入頁面，並尋找「忘記密碼」功能來重設您的密碼。</p>
            <p>（註：完整的密碼重設流程正在開發中！）</p>
            <p>如果您沒有請求此協助，請忽略此郵件。</p>
        `,
    });

    return response.status(200).json({ message: '如果您的信箱存在於我們的系統中，您將會收到一封提示郵件。' });
  
  } catch (error) {
    console.error('忘記密碼 API 錯誤:', error);
    return response.status(200).json({ message: '如果您的信箱存在於我們的系統中，您將會收到一封提示郵件。' });
  }
}