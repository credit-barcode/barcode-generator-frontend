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
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) return response.status(401).json({ message: '未提供授權 Token。' });
    const decodedUser = jwt.verify(token, JWT_SECRET);
    const userId = decodedUser.userId;

    const { currentPassword, newPassword } = request.body;
    if (!currentPassword) {
        return response.status(400).json({ message: '為了安全，請務必輸入您目前的密碼。' });
    }
    
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('password')
      .eq('id', userId)
      .single();
    if (fetchError) throw fetchError;

    const isPasswordMatch = await bcrypt.compare(currentPassword, userData.password);
    if (!isPasswordMatch) {
      return response.status(403).json({ message: '目前的密碼不正確。' });
    }

    const dataToUpdate = { last_modified: new Date().toISOString() };
    if (newPassword) {
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        return response.status(400).json({ message: '新密碼格式不符合要求。' });
      }
      dataToUpdate.password = await bcrypt.hash(newPassword, 10);
    }

    const { error: updateError } = await supabase.from('users').update(dataToUpdate).eq('id', userId);
    if (updateError) throw updateError;
    
    return response.status(200).json({ success: true, message: '個人資料更新成功！' });

  } catch (error) {
    console.error('更新個人資料 API 錯誤:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return response.status(403).json({ message: '無效或過期的 Token。' });
    }
    return response.status(500).json({ message: "更新失敗：" + error.message });
  }
}