// 檔案路徑: /api/_lib.js

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * 一個共用的輔助函式，用來驗證 JWT Token 並確認使用者是否為管理員。
 * @param {import('http').IncomingHttpHeaders} headers - 來自 Vercel request 的 headers 物件。
 * @returns {Promise<{user: object, error: object|null}>} - 回傳解密後的使用者 payload 或錯誤物件。
 */
export function verifyAdmin(headers) {
  return new Promise((resolve) => {
    const token = headers.authorization?.split(' ')[1];
    if (!token) {
      return resolve({ user: null, error: { status: 401, message: '未提供授權 Token。' } });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return resolve({ user: null, error: { status: 403, message: '無效或過期的 Token。' } });
      }

      // 【核心安全檢查】檢查 Token 中的 role 是否為 'admin'
      if (decoded.role !== 'admin') {
        return resolve({ user: null, error: { status: 403, message: '權限不足，此操作需要管理員身份。' } });
      }

      // 驗證成功，回傳解密後的使用者資訊
      resolve({ user: decoded, error: null });
    });
  });
}