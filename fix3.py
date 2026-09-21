"""批量修复所有注释和代码混在一行的问题"""
import re

path = r"E:\video-shotcraft\console-server.mjs"
with open(path, encoding="utf-8") as f:
    lines = f.readlines()

fixed = []
i = 0
while i < len(lines):
    line = lines[i]
    # 匹配：注释行（// 开头）后面直接跟 if (p === ...) {
    m = re.match(r'^(\s*)//.*if \(p === "(.*?)"', line)
    if m:
        indent = m.group(1)
        route = m.group(2)
        # 替换成纯注释
        fixed.append(indent + "  // 接口: " + route + "\n")
        # 下一行补 if 语句
        fixed.append(indent + '  if (p === "' + route + '") {\n')
    else:
        fixed.append(line)
    i += 1

with open(path, "w", encoding="utf-8") as f:
    f.writelines(fixed)

print("done")
