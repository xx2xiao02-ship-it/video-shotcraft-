"""逐行修复 console-server.mjs 的语法错误"""
path = r"E:\video-shotcraft\console-server.mjs"
with open(path, encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

fixed = []
for i, line in enumerate(lines, 1):
    # 修复所有 error: "..." 里的乱码
    if 'error: "' in line and any(ord(c) > 127 and not 0x4e00 <= ord(c) <= 0x9fff for c in line.split('error: "')[1].split('"')[0] if 'error: "' in line):
        # 这行有乱码，替换成安全字符串
        line = line.replace(line[line.find('error: "'):line.rfind('"')+1], 'error: "操作失败"')
    fixed.append(line)

with open(path, "w", encoding="utf-8") as f:
    f.writelines(fixed)

print("done")
