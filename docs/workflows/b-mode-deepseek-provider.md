# B模式 AccToken DeepSeek 接入

正式编导继续使用 `/api/talkcraft/intent`，不使用独立生成脚本。B编导通过 `talkcraft-editorial-provider.mjs` 选择当前任务供应商，未设置任务配置时沿用既有方舟行为；A模式不变。

## 配置与密钥

- 每个任务的配置位于本机 `%LOCALAPPDATA%/VideoShotCraft/b-mode-editorial-providers/<runId>.json`。测试环境可以用 `SHOTCRAFT_CONFIG_DIR` 隔离目录。配置只含 schema、runId、provider、baseUrl、model、wireApi，不存Key。
- 当前明确支持 `provider=acctoken`、`baseUrl=https://www.acctoken.com/v1`、`model=deepseek-v4.1-flash`、`wireApi=responses`。对应请求地址为 `/v1/responses`，不能误发至方舟或聊天接口。未知配置立即失败，不静默换模型。
- 密钥先读取 `ACCTOKEN_API_KEY`，否则通过当前Windows账户解密同目录下 `acctoken-api-key.clixml`。不写项目文件、日志或Git，不回显完整密钥。

## 请求与恢复

- 新供应商只允许一个请求目标，一次POST，无自动重试、跨供应商跌落或备用模型。网络、HTTP、格式和业务校验失败后停止；未知计费结果先核实，不重复提交。
- 费用授权绑定当前任务输入、修订范围以及供应商/URL/模型/凭据指纹。切换供应商或凭据后旧授权不能复用，须取得新的单次费用授权。配置本身不等于授权调用。
- Responses正文与现有正式提示词一致：当前两镜必填参数、单句字符锚点及素材约束仍由发送前检查和原编译器执行，不改字级时间、不补造业务内容、不放宽校验。
- 完整HTTP正文在解析前留存到当前事务，回执记录供应商、URL、模型、当前runId/requestId、输入及原文哈希。免费恢复只读当前回执，不因供应商配置切换而扫描旧任务。
- 中途失败不发布工作区设计；成功配音和数字人素材保持复用。07通过后由正式调度推进，14停在人审，不自动批准成片。

## 验证边界

离线测试覆盖供应商选择、精确报文、一次请求上限、授权配置变化、敏感信息隐藏、先保存后解析和同回执恢复。离线测试不代表真实模型生成成功；模型列表鉴权成功也不代表Responses生成成功。第3、8镜真实调用仍须新的单次付费授权。
