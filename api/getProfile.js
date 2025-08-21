// 檔案路徑: /api/getProfile.js

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// 初始化 Supabase 和 JWT_SECRET
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(request, response) {
  // 這個 API 只應該用 GET 方法來獲取資料
  if (request.method !== 'GET') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 步驟 1: 驗證 JWT Token，確保只有登入的使用者可以獲取自己的資料
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) {
      return response.status(401).json({ message: '未提供授權 Token。' });
    }
    const decodedUser = jwt.verify(token, JWT_SECRET);
    const userId = decodedUser.userId;

    // 步驟 2: 根據從 Token 中解密出的 userId，去資料庫查詢最新的使用者資料
    const { data: userData, error } = await supabase
        .from('users')
        .select('*') // 獲取所有欄位
        .eq('id', userId)
        .single();

    if (error) {
        throw error;
    }

    // 步驟 3: 打包一個安全的、不包含密碼的 userProfile 物件
    const userProfile = {
        account: userData.account,
        email: userData.email,
        current_quota: userData.current_quota,
        register_date: userData.register_date,
        last_modified: userData.last_modified,
        isAdmin: userData.is_admin === true
    };

    // 步驟 4: 回傳最新的使用者資料
    return response.status(200).json(userProfile);

  } catch (error) {
    console.error('獲取個人資料 API 錯誤:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return response.status(403).json({ message: '無效或過期的 Token。' });
    }
    return response.status(500).json({ message: error.message });
  }
}