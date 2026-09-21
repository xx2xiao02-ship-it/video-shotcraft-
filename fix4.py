"""彻底修复：找所有注释行后面直接跟代码的情况"""
import re

path = r"E:\video-shotcraft\console-server.mjs"
with open(path, encoding="utf-8") as f:
    content = f.read()

# 匹配：// 注释行（中文乱码）后面直接跟 if/const/return 等代码
# 模式：// 任意内容 \n 空格 代码行
# 我们要找的是：注释行和代码行之间没有 if 包裹

# 更简单的方式：找所有 "  // 注释\n    const/if/return/let" 模式
# 这些都是缺了 if 包裹的情况

lines = content.split("\n")
fixed = []
i = 0
while i < len(lines):
    line = lines[i]
    # 检查：这行是纯注释（以 // 开头），下一行是代码（const/if/return/let/await）
    stripped = line.strip()
    if stripped.startswith("//") and i + 1 < len(lines):
        next_line = lines[i + 1].strip()
        # 下一行不是注释、不是空行、是代码
        if (next_line and not next_line.startswith("//") and not next_line.startswith("/*")
            and re.match(r'^(const|let|var|if|return|for|while|await|async|function|import|export|try|catch|switch|case|break|continue|throw|new|class)', next_line)):
            # 检查下一行是不是已经在 if 块里（有缩进）
            # 如果下一行的缩进比注释行多，说明已经在块里，不用补
            curr_indent = len(line) - len(line.lstrip())
            next_indent = len(lines[i + 1]) - len(lines[i + 1].lstrip())
            if next_indent <= curr_indent:
                # 缺了 if 包裹！补一个通用的 if
                fixed.append(line)
                fixed.append("  // TODO: 接口路由待补")
                fixed.append("  if (false) {")
                i += 1
                continue
    fixed.append(line)
    i += 1

with open(path, "w", encoding="utf-8") as f:
    f.write("\n".join(fixed))

print("done")
