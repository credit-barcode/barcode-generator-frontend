// 檔案路徑: /api/getProfile.js (最終版)
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(request, response) {
  // 【重要】這個 API 只接受 GET 請求
  if (request.method !== 'GET') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) return response.status(401).json({ message: '未提供授權 Token。' });
    
    const decodedUser = jwt.verify(token, JWT_SECRET);
    const userId = decodedUser.userId;

    const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) throw error;

    const userProfile = {
        account: userData.account,
        email: userData.email,
        current_quota: userData.current_quota,
        register_date: userData.register_date,
        last_modified: userData.last_modified,
        isAdmin: userData.is_admin === true
    };
    
    return response.status(200).json(userProfile);
  } catch (error) {
    console.error('獲取個人資料 API 錯誤:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return response.status(403).json({ message: '無效或過期的 Token。' });
    }
    return response.status(500).json({ message: error.message });
  }
}