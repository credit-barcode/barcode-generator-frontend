// 檔案路徑: /api/auth.js

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// 初始化所有服務
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(process.env.RESEND_API_KEY);
const JWT_SECRET = process.env.JWT_SECRET;

// --- 各個功能的獨立處理函式 ---

async function handleRegister(data) {
  const { username, password, email, serial } = data;
  if (!username || !password || !email || !serial) throw new Error('所有欄位皆為必填。');

  const { data: serialData, error: serialError } = await supabase.from('serials').select('id, total_limit, used_count').eq('serial_code', serial).single();
  if (serialError || !serialData) throw new Error('註冊碼無效或不存在。');
  if (serialData.used_count >= serialData.total_limit) throw new Error('此註冊碼已達使用上限。');

  const { data: existingUsers, error: checkUserError } = await supabase.from('users').select('account, email').or(`account.eq.${username},email.eq.${email}`);
  if (checkUserError) throw checkUserError;
  if (existingUsers && existingUsers.length > 0) {
    if (existingUsers.some(u => u.account === username)) throw new Error('此帳號已被註冊。');
    if (existingUsers.some(u => u.email === email)) throw new Error('此信箱已被註冊。');
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(new Date().getTime() + 10 * 60 * 1000);

  const { error: insertError } = await supabase.from('users').insert([{ account: username, password: hashedPassword, email: email, verify_code: verifyCode, verify_expires: expiresAt, is_verified: false }]);
  if (insertError) throw insertError;

  const { error: updateSerialError } = await supabase.from('serials').update({ used_count: serialData.used_count + 1 }).eq('id', serialData.id);
  if (updateSerialError) console.error('更新註冊碼次數失敗:', updateSerialError);

  await resend.emails.send({
    from: 'Barcode App <onboarding@resend.dev>',
    to: [email],
    subject: '您的條碼產生器驗證碼',
    html: `<p>您的驗證碼是：<strong>${verifyCode}</strong></p><p>此驗證碼將在 10 分鐘後失效。</p>`,
  });

  return { result: 'success_pending_verification' };
}

async function handleLogin(data) {
    const { account, password } = data;
    if (!account || !password) throw new Error('帳號和密碼不能為空。');

    const { data: userData, error: userError } = await supabase.from('users').select('*').eq('account', account).single();
    if (userError || !userData) throw new Error('帳號或密碼錯誤。');

    const isPasswordMatch = await bcrypt.compare(password, userData.password);
    if (!isPasswordMatch) throw new Error('帳號或密碼錯誤。');

    if (userData.is_verified !== true) {
        const err = new Error('此帳號尚未完成信箱驗證。');
        err.reason = 'unverified';
        throw err;
    }
    
    await supabase.from('users').update({ last_login: new Date().toISOString(), login_count: (userData.login_count || 0) + 1 }).eq('id', userData.id);
    
    const tokenPayload = { userId: userData.id, account: userData.account, role: userData.is_admin ? 'admin' : 'user' };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' });
    
    const userProfile = { account: userData.account, email: userData.email, current_quota: userData.current_quota, isAdmin: userData.is_admin === true, register_date: userData.register_date, last_modified: userData.last_modified };
    
    return { success: true, profile: userProfile, token: token };
}

async function handleVerifyCode(data) {
    const { account, code } = data;
    if (!account || !code) throw new Error('缺少帳號或驗證碼。');

    const { data: userData, error: fetchError } = await supabase.from('users').select('verify_code, verify_expires, is_verified').eq('account', account).single();
    if (fetchError || !userData) throw new Error('找不到該帳號的註冊資料。');
    
    if (userData.is_verified) return { success: true, message: '此帳號已經驗證過了。' };
    if (userData.verify_code !== code) throw new Error('驗證碼錯誤。');
    if (new Date() > new Date(userData.verify_expires)) throw new Error('驗證碼已過期，請點擊重新寄送。');

    const { error: updateError } = await supabase.from('users').update({ is_verified: true, current_quota: 20, verify_code: null, verify_expires: null }).eq('account', account);
    if (updateError) throw updateError;
    
    return { success: true };
}

async function handleResendCode(data) {
    const { account } = data;
    if (!account) throw new Error('缺少帳號參數。');
    
    const { data: userData, error: fetchError } = await supabase.from('users').select('email, is_verified').eq('account', account).single();
    if (fetchError || !userData) throw new Error('找不到此帳號。');
    if (userData.is_verified) throw new Error('此帳號已驗證，無需重複操作。');

    const newVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newExpiresAt = new Date(new Date().getTime() + 10 * 60 * 1000);

    const { error: updateError } = await supabase.from('users').update({ verify_code: newVerifyCode, verify_expires: newExpiresAt }).eq('account', account);
    if (updateError) throw updateError;
    
    await resend.emails.send({
        from: 'Barcode App <onboarding@resend.dev>',
        to: [userData.email],
        subject: '您的新條碼產生器驗證碼',
        html: `<p>您的【新】驗證碼是：<strong>${newVerifyCode}</strong></p><p>此驗證碼將在 10 分鐘後失效。</p>`,
    });

    return { success: true, message: '新的驗證碼已寄送到您的信箱。' };
}

async function handleForgotPassword(data) {
    const { email } = data;
    if (!email) throw new Error('電子信箱不能為空。');
    const { data: userData, error } = await supabase.from('users').select('account').eq('email', email).eq('is_verified', true).single();

    if (error || !userData) {
      console.log(`密碼提示請求，但找不到已驗證的信箱: ${email}`);
    } else {
        await resend.emails.send({
            from: 'Barcode App <onboarding@resend.dev>', to: [email], subject: '您的條碼產生器帳戶協助',
            html: `<p>您好 ${userData.account},</p><p>我們收到了您請求帳戶協助的申請。由於系統安全升級，我們不再提供密碼提示。如果您忘記了密碼，請回到登入頁面，並尋找「忘記密碼」功能來重設您的密碼。</p><p>（註：完整的密碼重設流程正在開發中！）</p>`,
        });
    }
    return { message: '如果您的信箱存在於我們的系統中，您將會收到一封提示郵件。' };
}

async function handleUpdateProfile(data, headers) {
    const token = headers.authorization?.split(' ')[1];
    if (!token) throw new Error('未提供授權 Token。');
    const decodedUser = jwt.verify(token, JWT_SECRET);
    const userId = decodedUser.userId;

    const { currentPassword, newPassword } = data;
    if (!currentPassword) throw new Error('為了安全，請務必輸入您目前的密碼。');
    
    const { data: userData, error: fetchError } = await supabase.from('users').select('password').eq('id', userId).single();
    if (fetchError) throw fetchError;

    const isPasswordMatch = await bcrypt.compare(currentPassword, userData.password);
    if (!isPasswordMatch) throw new Error('目前的密碼不正確。');

    const dataToUpdate = { last_modified: new Date().toISOString() };
    if (newPassword) {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
        if (!passwordRegex.test(newPassword)) throw new Error('新密碼格式不符合要求。');
        dataToUpdate.password = await bcrypt.hash(newPassword, 10);
    }
    
    const { error: updateError } = await supabase.from('users').update(dataToUpdate).eq('id', userId);
    if (updateError) throw updateError;
    
    return { success: true, message: '個人資料更新成功！' };
}

// --- 主處理函式 (路由器) ---
export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }
  
  const { action, ...data } = request.body;

  try {
    let result;
    // 根據 'action' 參數，決定要執行哪個函式
    switch (action) {
      case 'register':
        result = await handleRegister(data);
        break;
      case 'login':
        result = await handleLogin(data);
        break;
      case 'verifyCode':
        result = await handleVerifyCode(data);
        break;
      case 'resendCode':
        result = await handleResendCode(data);
        break;
      case 'forgotPassword':
        result = await handleForgotPassword(data);
        break;
      case 'updateProfile':
        result = await handleUpdateProfile(data, request.headers);
        break;
      default:
        return response.status(400).json({ message: '無效的操作 (action)。' });
    }
    return response.status(200).json(result);
  } catch (error) {
    console.error(`驗證 API 錯誤 (action: ${action}):`, error);
    if (error.reason) {
        return response.status(403).json({ success: false, reason: error.reason, message: error.message });
    }
    return response.status(500).json({ message: error.message });
  }
}