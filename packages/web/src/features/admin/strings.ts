/**
 * The admin module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `admin` section. A new string is added here, to both fragments, and
 * nowhere else — `AdminStrings` makes a key missing from `adminEn` a type error.
 */
export const adminZh = {
  users: "用户管理",
  roleAdmin: "管理员",
  roleUser: "用户",
  createUser: "新增用户",
  initialPassword: "初始密码",
  initialPasswordFlag: "初始密码",
  defaultProjectNote: (id: string): string => `将自动创建默认 Project：${id}`,
  resetPassword: "重置密码",
  resetPasswordTitle: (u: string): string => `重置 ${u} 的密码`,
  resetPasswordNote: "重置后该用户的登录会话全部失效，需用新密码重新登录",
  deleteUserTitle: (u: string): string => `删除用户 ${u}`,
  deleteUserConfirm: (u: string): string =>
    `将删除用户 ${u} 及其名下全部 Project（含数据目录），不可恢复。`,
};

export type AdminStrings = typeof adminZh;

export const adminEn: AdminStrings = {
  users: "Users",
  roleAdmin: "Admin",
  roleUser: "User",
  createUser: "Add user",
  initialPassword: "Initial password",
  initialPasswordFlag: "initial password",
  defaultProjectNote: (id: string): string => `A default Project will be created: ${id}`,
  resetPassword: "Reset password",
  resetPasswordTitle: (u: string): string => `Reset password for ${u}`,
  resetPasswordNote:
    "All sign-in sessions of this user will be revoked; they must sign in with the new password",
  deleteUserTitle: (u: string): string => `Delete user ${u}`,
  deleteUserConfirm: (u: string): string =>
    `This deletes user ${u} and every Project they own (including data directories). This cannot be undone.`,
};
