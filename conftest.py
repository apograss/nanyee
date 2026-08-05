"""pytest 全局：默认不读取本地 .env，避免开发机配置（代理、密钥）污染用例。

需要覆盖 env 加载行为的用例仍可显式传 _env_file 覆盖此默认值。
"""

from nanyee.config import Settings

Settings.model_config["env_file"] = None
