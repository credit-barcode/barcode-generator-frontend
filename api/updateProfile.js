// 檔案路徑: /api/updateProfile.js

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
    // 1. 驗證使用者 JWT Token
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) return response.status(401).json({ message: '未提供授權 Token。' });
    const decodedUser = jwt.verify(token, JWT_SECRET);
    const userId = decodedUser.userId;

    // 2. 獲取前端傳來的資料
    const { currentPassword, newPassword } = request.body;
    
    // 3. 獲取使用者當前的資料，特別是加密過的密碼
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('password')
      .eq('id', userId)
      .single();
    if (fetchError) throw fetchError;

    // 4. 驗證舊密碼是否正確
    const isPasswordMatch = await bcrypt.compare(currentPassword, userData.password);
    if (!isPasswordMatch) {
      return response.status(403).json({ message: '目前的密碼不正確。' });
    }

    // 5. 如果有提供新密碼，就將其雜湊
    let newHashedPassword = null;
    if (newPassword) {
      if (newPassword.length < 8) { // 簡易的密碼長度驗證
         return response.status(400).json({ message: '新密碼長度至少需要 8 個字元。' });
      }
      newHashedPassword = await bcrypt.hash(newPassword, 10);
    }

    // 6. 準備要更新的資料
    const dataToUpdate = {
        last_modified: new Date().toISOString()
    };
    if (newHashedPassword) {
        dataToUpdate.password = newHashedPassword;
    }

    // 7. 更新資料庫
    const { error: updateError } = await supabase
      .from('users')
      .update(dataToUpdate)
      .eq('id', userId);
    if (updateError) throw updateError;
    
    return response.status(200).json({ success: true, message: '個人資料更新成功！' });

  } catch (error) {
    console.error('更新個人資料 API 錯誤:', error);
    return response.status(500).json({ message: error.message });
  }
}