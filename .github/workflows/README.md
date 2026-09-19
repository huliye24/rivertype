# Workflows

CI / CD 流水线定义。

| 文件                  | 触发                | 作用                     |
|---------------------|-------------------|------------------------|
| [validate.yml](./validate.yml) | push / PR to main | 跑 RTP 校验器测试 + 示例校验 |

## validate.yml

每次 push 或 PR 触发,自动执行:

1. **RTP 校验器测试** — `python tools/validator_tests.py`(6 个测试用例)
2. **示例文件校验** — `python tools/validator.py examples/`
3. **严格模式校验** — `python tools/validator.py --strict examples/`
4. **Python 语法检查** — `py_compile` 校验所有 Python 文件

任何一项失败,CI 失败,不允许 merge。

## 本地运行

```bash
# 跑校验器测试
python tools/validator_tests.py

# 校验单个文件
python tools/validator.py examples/道德经-第一章.rt

# 校验目录
python tools/validator.py examples/

# 严格模式(警告也算失败)
python tools/validator.py --strict examples/
```

## 添加新工作流

新工作流文件放本目录下,文件名描述其职责(如 `docs-build.yml`、`release.yml`)。
