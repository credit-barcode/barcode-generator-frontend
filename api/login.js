// 檔案路徑: /api/login.js (管理員角色增強版)

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    const { account, password } = request.body;
    if (!account || !password) {
      return response.status(400).json({ message: '帳號和密碼不能為空。' });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('account', account)
      .single();

    if (userError || !userData) {
      return response.status(401).json({ message: '帳號或密碼錯誤。' });
    }

    const isPasswordMatch = await bcrypt.compare(password, userData.password);
    if (!isPasswordMatch) {
      return response.status(401).json({ message: '帳號或密碼錯誤。' });
    }

    if (userData.is_verified !== true) {
      return response.status(403).json({ success: false, reason: 'unverified', message: '此帳號尚未完成信箱驗證。' });
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ last_login: new Date().toISOString(), login_count: (userData.login_count || 0) + 1 })
      .eq('id', userData.id);
    if (updateError) {
      console.error('更新登入資訊失敗:', updateError);
    }
    
    // ▼▼▼ 【核心新增】準備要放入 Token 的 payload ▼▼▼
    const tokenPayload = {
        userId: userData.id,
        account: userData.account,
        // 將使用者的角色 (role) 也加入到 Token 中
        role: userData.is_admin ? 'admin' : 'user' 
    };
    // ▲▲▲ 【核心新增】 ▲▲▲
    
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' });
    
    // ▼▼▼ 【核心修正】準備回傳給前端的 profile，也加上角色資訊 ▼▼▼
    const userProfile = {
        account: userData.account,
        email: userData.email,
        current_quota: userData.current_quota,
        register_date: userData.register_date,
        last_modified: userData.last_modified,
        isAdmin: userData.is_admin === true // 明確地回傳一個布林值
    };
    // ▲▲▲ 【核心修正】 ▲▲▲
    
    return response.status(200).json({ success: true, profile: userProfile, token: token });

  } catch (error) {
    console.error('登入 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}