// 檔案路徑: /api/auth.js
// 此檔案整合所有身份驗證功能
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(process.env.RESEND_API_KEY);
const JWT_SECRET = process.env.JWT_SECRET;

// --- 註冊 ---
async function handleRegister(data) {
  const { username, password, email, serial } = data;
  if (!username || !password || !email || !serial) {
    return { error: '缺少必要欄位' };
  }
  const { data: serialData, error: serialError } = await supabase.from('serials').select('id, total_limit, used_count').eq('serial_code', serial).single();
  if (serialError || !serialData) return { error: '註冊碼無效' };
  if (serialData.used_count >= serialData.total_limit) return { error: '註冊碼已達上限' };
  const { data: existingUsers } = await supabase.from('users').select('account, email').or(`account.eq.${username},email.eq.${email}`);
  if (existingUsers && existingUsers.length > 0) return { error: '帳號或信箱已存在' };
  const hashedPassword = await bcrypt.hash(password, 10);
  const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(new Date().getTime() + 10 * 60 * 1000);
  await supabase.from('users').insert([{ account: username, password: hashedPassword, email, verify_code: verifyCode, verify_expires: expiresAt, is_verified: false }]);
  await supabase.from('serials').update({ used_count: serialData.used_count + 1 }).eq('id', serialData.id);
  await resend.emails.send({ from: 'Barcode App <onboarding@resend.dev>', to: [email], subject: '您的條碼產生器驗證碼', html: `<p>您的驗證碼是：<strong>${verifyCode}</strong></p><p>此驗證碼將在 10 分鐘後失效。</p>` });
  return { result: 'success_pending_verification' };
}

// --- 登入 ---
async function handleLogin(data) {
  const { account, password } = data;
  if (!account || !password) return { error: '缺少帳號或密碼' };
  const { data: userData, error: userError } = await supabase.from('users').select('*').eq('account', account).single();
  if (userError || !userData) return { error: '帳號不存在' };
  const isPasswordMatch = await bcrypt.compare(password, userData.password);
  if (!isPasswordMatch) return { error: '密碼錯誤' };
  if (userData.is_verified !== true) return { error: '尚未完成信箱驗證' };
  await supabase.from('users').update({ last_login: new Date().toISOString(), login_count: (userData.login_count || 0) + 1 }).eq('id', userData.id);
  const tokenPayload = { userId: userData.id, account: userData.account, role: userData.is_admin ? 'admin' : 'user' };
  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' });
  const userProfile = { account: userData.account, email: userData.email, current_quota: userData.current_quota, isAdmin: userData.is_admin === true, register_date: userData.register_date, last_modified: userData.last_modified };
  return { success: true, profile: userProfile, token };
}

// --- 驗證信箱 ---
async function handleVerifyCode(data) {
  const { account, code } = data;
  if (!account || !code) return { error: '缺少帳號或驗證碼' };
  const { data: userData, error: fetchError } = await supabase.from('users').select('verify_code, verify_expires, is_verified').eq('account', account).single();
  if (fetchError || !userData) return { error: '帳號不存在' };
  if (userData.is_verified) return { error: '已驗證' };
  if (userData.verify_code !== code) return { error: '驗證碼錯誤' };
  if (new Date() > new Date(userData.verify_expires)) return { error: '驗證碼已過期' };
  await supabase.from('users').update({ is_verified: true, current_quota: 20, verify_code: null, verify_expires: null }).eq('account', account);
  return { success: true };
}

// --- 重新寄送驗證碼 ---
async function handleResendCode(data) {
  const { account } = data;
  if (!account) return { error: '缺少帳號' };
  const { data: userData, error: fetchError } = await supabase.from('users').select('email, is_verified').eq('account', account).single();
  if (fetchError || !userData) return { error: '帳號不存在' };
  if (userData.is_verified) return { error: '已驗證' };
  const newVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
  const newExpiresAt = new Date(new Date().getTime() + 10 * 60 * 1000);
  await supabase.from('users').update({ verify_code: newVerifyCode, verify_expires: newExpiresAt }).eq('account', account);
  await resend.emails.send({ from: 'Barcode App <onboarding@resend.dev>', to: [userData.email], subject: '您的新條碼產生器驗證碼', html: `<p>您的【新】驗證碼是：<strong>${newVerifyCode}</strong></p><p>此驗證碼將在 10 分鐘後失效。</p>` });
  return { success: true, message: '新的驗證碼已寄送到您的信箱。' };
}

// --- 忘記密碼 ---
async function handleForgotPassword(data) {
  const { email } = data;
  if (!email) return { error: '缺少信箱' };
  const { data: userData, error } = await supabase.from('users').select('account').eq('email', email).eq('is_verified', true).single();
  // 實際應寄送密碼重設信件，這裡僅回應
  return { message: '如果您的信箱存在於我們的系統中，您將會收到一封提示郵件。' };
}

// --- 會員資料查詢與更新 ---
async function handleGetProfile(headers) {
  const token = headers.authorization?.split(' ')[1];
  if (!token) return { error: '未提供授權 Token。' };

  try {
    const decodedUser = jwt.verify(token, JWT_SECRET);
    const userId = decodedUser.userId;

    const { data: userData, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error) return { error: '找不到使用者' };

    return {
      account: userData.account,
      email: userData.email,
      current_quota: userData.current_quota,
      register_date: userData.register_date,
      last_modified: userData.last_modified,
      isAdmin: userData.is_admin === true
    };
  } catch (err) {
    console.error('處理 getProfile 時發生錯誤:', err);
    return { error: '無法解碼 Token 或查詢使用者資料' };
  }
}
async function handleUpdateProfile(data, headers) {
  const token = headers.authorization?.split(' ')[1];
  if (!token) return { error: '未提供授權 Token。' };
  const decodedUser = jwt.verify(token, JWT_SECRET);
  const userId = decodedUser.userId;
  const { currentPassword, newPassword } = data;
  if (!currentPassword) return { error: '請輸入目前密碼' };
  const { data: userData, error: fetchError } = await supabase.from('users').select('password').eq('id', userId).single();
  if (fetchError) return { error: '找不到使用者' };
  const isPasswordMatch = await bcrypt.compare(currentPassword, userData.password);
  if (!isPasswordMatch) return { error: '目前密碼錯誤' };
  if (newPassword && newPassword.length >= 8) {
    const hashed = await bcrypt.hash(newPassword, 10);
    await supabase.from('users').update({ password: hashed, last_modified: new Date().toISOString() }).eq('id', userId);
    return { success: true };
  }
  return { success: true };
}

// --- 路由主處理 ---
export default async function handler(request, response) {
  try {
    if (request.method === 'POST') {
      const { action, ...data } = request.body;
      if (action === 'register') return response.json(await handleRegister(data));
      if (action === 'login') return response.json(await handleLogin(data));
      if (action === 'verifyCode') return response.json(await handleVerifyCode(data));
      if (action === 'resendCode') return response.json(await handleResendCode(data));
      if (action === 'forgotPassword') return response.json(await handleForgotPassword(data));
      if (action === 'updateProfile') return response.json(await handleUpdateProfile(data, request.headers));
      return response.status(400).json({ error: '未知的 action' });
    } else if (request.method === 'GET') {
      if (request.query.action === 'getProfile') return response.json(await handleGetProfile(request.headers));
      return response.status(400).json({ error: '未知的 action' });
    } else {
      return response.status(405).json({ message: 'Method Not Allowed' });
    }
  } catch (error) {
    console.error('API 處理錯誤:', error);
    return response.status(500).json({ error: error.message });
  }
}

