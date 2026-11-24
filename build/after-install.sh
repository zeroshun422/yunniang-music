#!/bin/bash
# .deb 安装后：注册命令入口、修正 chrome-sandbox 权限、安装 AppArmor profile、刷新桌面数据库
#
# 为什么这里必须自己处理（教训）：
#   本文件通过 electron-builder.yml 的 deb.afterInstall 覆盖了 electron-builder 内置的
#   after-install.tpl。一旦覆盖，内置模板里的 chmod / update-alternatives / AppArmor
#   安装逻辑会整份消失，导致 .deb 能装上但一启动就 FATAL：
#     "The SUID sandbox helper binary was found, but is not configured correctly."
#   v2.0.2 及更早版本就是这个问题（Ubuntu 24.04 上必现）。
#
# 关于 chmod 选择的一个坑：
#   内置模板用 `unshare --user true` 探测 userns，成功就 chmod 0755、失败才 chmod 4755。
#   但 Ubuntu 24.04 默认 kernel.apparmor_restrict_unprivileged_userns=1，普通 shell 的
#   `unshare --user true` 往往仍能成功，于是模板会选 0755；而 Chromium 只要发现
#   chrome-sandbox 存在却权限不对就直接 abort，并不会回退到 userns sandbox。
#   所以这里无条件设 4755（root:root + SUID），这是唯一稳定可用的组合。

set -e

APP_DIR='/opt/${sanitizedProductName}'
SANDBOX="$APP_DIR/chrome-sandbox"
BIN_PATH="$APP_DIR/${executable}"

# 1) 注册命令行入口 /usr/bin/<executable>
if type update-alternatives >/dev/null 2>&1; then
  # 若存在不由 update-alternatives 管理的旧软链，先清掉，否则 --install 会报错
  if [ -L "/usr/bin/${executable}" ] && [ -e "/usr/bin/${executable}" ] \
     && [ "$(readlink "/usr/bin/${executable}")" != "/etc/alternatives/${executable}" ]; then
    rm -f "/usr/bin/${executable}"
  fi
  update-alternatives --install "/usr/bin/${executable}" '${executable}' "$BIN_PATH" 100 \
    || ln -sf "$BIN_PATH" "/usr/bin/${executable}"
else
  ln -sf "$BIN_PATH" "/usr/bin/${executable}"
fi

# 2) chrome-sandbox 必须 root:root 且带 SUID(4755)
#
# 注意：这两个条件缺一不可。只 chmod 不 chown 会得到 4755 但属主非 root，
# Chromium 同样会 FATAL（它检查的是「属主 root 且 mode 含 SUID」）。
# 所以 chmod 之后再校验一次属主，不要假定 chown 一定成功。
if [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX" 2>/dev/null || true
  if chmod 4755 "$SANDBOX" 2>/dev/null; then
    :
  else
    # 例如 /opt 位于 nosuid 挂载点。此时 SUID 方案不可用，退回 0755 并明确告警，
    # 不要静默失败——用户至少知道可以用 ELECTRON_DISABLE_SANDBOX=1 临时启动。
    chmod 0755 "$SANDBOX" 2>/dev/null || true
    echo "警告：无法为 $SANDBOX 设置 SUID 位，Chromium 沙箱可能无法启动。" >&2
    echo "      临时方案：ELECTRON_DISABLE_SANDBOX=1 ${executable}" >&2
  fi

  # 实测校验最终状态，不满足就告警（正常情况下 dpkg 以 root 运行，这里必然通过）
  _sb_owner="$(stat -c '%U' "$SANDBOX" 2>/dev/null || echo unknown)"
  _sb_mode="$(stat -c '%a' "$SANDBOX" 2>/dev/null || echo 000)"
  case "$_sb_mode" in
    4?55) _sb_suid=1 ;;
    *)    _sb_suid=0 ;;
  esac
  if [ "$_sb_owner" != root ] || [ "$_sb_suid" != 1 ]; then
    echo "警告：$SANDBOX 当前为 $_sb_mode $_sb_owner:$(stat -c '%G' "$SANDBOX" 2>/dev/null)，" >&2
    echo "      需要 4755 root:root，否则程序启动会因 SUID 沙箱校验失败而退出。" >&2
    echo "      请以 root 执行：chown root:root '$SANDBOX' && chmod 4755 '$SANDBOX'" >&2
    echo "      或用 ELECTRON_DISABLE_SANDBOX=1 ${executable} 临时启动。" >&2
  fi
fi

# 3) 安装 AppArmor profile（Ubuntu 24+ 需要；22.04 不支持 abi/4.0，跳过）
APPARMOR_SRC="$APP_DIR/resources/apparmor-profile"
APPARMOR_DST="/etc/apparmor.d/${executable}"
if [ -f "$APPARMOR_SRC" ] && command -v apparmor_status >/dev/null 2>&1; then
  if apparmor_status --enabled >/dev/null 2>&1; then
    # 先做一次不落盘的语法检查，避免老版本 AppArmor 把 /etc/apparmor.d 弄脏
    if apparmor_parser --skip-kernel-load --debug "$APPARMOR_SRC" >/dev/null 2>&1; then
      cp -f "$APPARMOR_SRC" "$APPARMOR_DST"
      # chroot 内做 live 的 profile 加载没有意义，和内置模板保持一致地跳过
      if ! { [ -x /usr/bin/ischroot ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
        apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_DST" || true
      fi
    else
      echo "跳过 AppArmor profile 安装：当前 AppArmor 不支持随包的 abi/4.0 规则。" >&2
    fi
  fi
fi

# 4) 刷新桌面数据库与图标缓存
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true
fi

exit 0
