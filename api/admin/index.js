// 檔案路徑: /api/admin/index.js (最終整合版)

import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_lib.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(request, response) {
  try {
    // 步驟 1: 所有請求都先驗證管理員權限
    const { error: authError } = await verifyAdmin(request.headers);
    if (authError) {
      return response.status(authError.status).json({ message: authError.message });
    }

    // 步驟 2: 解析請求的 URL 來判斷使用者想要操作的「資源」
    // request.url 會是像 '/api/admin/users' 或 '/api/admin/serials'
    const url = new URL(request.url, `https://${request.headers.host}`);
    const pathSegments = url.pathname.split('/').filter(Boolean); // 結果: ['api', 'admin', 'users']
    const resource = pathSegments[2]; // 獲取 'users' 或 'serials'

    // 步驟 3: 根據資源和 HTTP 方法進行路由
    switch (resource) {
      case 'users':
        if (request.method === 'GET') {
          // 獲取使用者列表
          const { data, error } = await supabase.from('users').select('id, account, permission, current_quota, reset_quota, register_date').order('created_at', { ascending: false });
          if (error) throw error;
          return response.status(200).json(data);
        }
        if (request.method === 'POST') {
          // 更新使用者資料
          const usersData = request.body;
          if (!Array.isArray(usersData)) return response.status(400).json({ message: '未提供有效的更新資料。' });
          const updatePromises = usersData.map(user => {
            const { id, permission, current_quota, reset_quota } = user;
            if (!id) throw new Error('更新資料中缺少使用者 ID。');
            return supabase.from('users').update({ permission, current_quota, reset_quota }).eq('id', id);
          });
          await Promise.all(updatePromises);
          return response.status(200).json({ success: true, message: '使用者資料儲存成功！' });
        }
        break;

      case 'serials':
        if (request.method === 'GET') {
          // 獲取註冊碼列表
          const { data, error } = await supabase.from('serials').select('*').order('created_at', { ascending: false });
          if (error) throw error;
          return response.status(200).json(data);
        }
        if (request.method === 'POST') {
          // 更新註冊碼資料
          const serialsData = request.body;
          if (!Array.isArray(serialsData)) return response.status(400).json({ message: '未提供有效的更新資料。' });
          
          await supabase.from('serials').delete().neq('id', 0);
          if (serialsData.length > 0) {
            const cleanData = serialsData.map(({ serial_code, total_limit, used_count }) => ({ serial_code, total_limit, used_count }));
            const { error: insertError } = await supabase.from('serials').insert(cleanData);
            if (insertError) throw insertError;
          }
          return response.status(200).json({ success: true, message: '註冊碼儲存成功！' });
        }
        break;

      default:
        // 如果請求的路徑不是 /users 或 /serials
        return response.status(404).json({ message: '找不到指定的管理員資源。' });
    }
    
    // 如果請求方法不匹配 (例如對 /users 使用 PUT)
    response.setHeader('Allow', ['GET', 'POST']);
    return response.status(405).json({ message: `Method ${request.method} Not Allowed for resource ${resource}` });

  } catch (error) {
    console.error('管理員 API 錯誤:', error);
    return response.status(500).json({ message: `管理員 API 發生錯誤：${error.message}` });
  }
}