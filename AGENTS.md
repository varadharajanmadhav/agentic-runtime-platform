# Codex Guidelines: Prioritize CodeGraph

This project has CodeGraph configured. As an AI agent/assistant, you MUST always refer to CodeGraph before executing raw text searches or reading random files.

## CodeGraph MCP & CLI Guidelines

1. **Use CodeGraph First**: For all structural code queries (such as "Where is X defined?", "What calls Y?", or "What is the signature of Z?"), query the CodeGraph index.
2. **How to Query**:
   - **MCP Server**: If the `codegraph` MCP server is loaded, use the corresponding `codegraph_*` tools.
   - **CLI Tool**: If the MCP tools are not loaded, use the CLI via `run_command` (e.g. `codegraph query <search>`, `codegraph context <task>`, or `codegraph status`).
3. **Avoid Grep & File Read Loops**: Do not use `grep_search` or `view_file` to locate symbols or explore relationships. CodeGraph is pre-indexed, faster, and highly token-efficient.
4. **Verification**: Only read/write files when you have identified the exact target via CodeGraph.
