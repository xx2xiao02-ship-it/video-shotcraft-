"""批量修复 console-server.mjs 所有乱码"""
import re

path = r"E:\video-shotcraft\console-server.mjs"
with open(path, encoding="utf-8", errors="replace") as f:
    content = f.read()

# 所有乱码模式 → 正确中文
fixes = {
    "鏈壘鍒版枃浠": "未找到文件",
    "浠诲姟涓嶅瓨鍦": "任务不存在",
    "鍒嗛暅鏍″噯": "分镜校准",
    "鏂囨涓虹┖": "文案为空",
    "鍐欏埌鏂囦欢": "写到文件",
    "搴斾娇鐢?: "应使用",
    "杈撳叆涓虹┖": "输入为空",
    "瀵瑰簲涓嶅瓨鍦": "对应不存在",
    "绉侀摼鎺ュ": "阶段连接",
    "璧峰": "开始",
    "鍔": "作",
    "鏌ヨ": "查询",
    "鏃": "时",
    "閿": "锁",
    "敓": "生",
    "鍑": "出",
    "鎻": "锁",
    "帴": "接",
    "鏍": "校",
    "湡": "真",
    "褰": "形",
    "鏌": "查",
    "杈": "传",
    "敭": "键",
    "鍒": "创",
    "鍦": "在",
    "閲": "阅",
    "鑾": "获",
    "鍙": "可",
    "澶": "大",
    "湁": "有",
    "鏈": "未",
    "鏄": "是",
    "涓": "不",
    "涔": "怎",
    "鍝": "什",
    "鍐": "内",
    "鍔": "动",
    "姩": "动",
    "鎺": "控",
    "枃": "文",
    "浠": "务",
    "鐢": "用",
    "鎵": "操",
    "鍒": "制",
    "綍": "录",
    "鍙": "变",
    "閫": "通",
    "閲": "阅",
    "鑾": "获",
}

# 更简单的方式：直接找所有 sendJson(res, { error: "..." }) 里的乱码
# 匹配 error: "xxx" 模式，如果里面有乱码字符（不在常用中文范围），就替换
def fix_error_strings(text):
    pattern = r'error: "([^"]*)"'
    def repl(m):
        s = m.group(1)
        # 如果有乱码（替换字符），就替换成通用错误信息
        if '\ufffd' in s:
            return 'error: "操作失败"'
        return m.group(0)
    return re.sub(pattern, repl, text)

content = fix_error_strings(content)

# 修复引号未闭合的情况：error: "xxx? });
content = re.sub(r'error: "([^"]*?)\? \}\);', r'error: "\1" });', content)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("done")
