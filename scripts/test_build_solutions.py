"""Tests for build_solutions.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_solutions import strip_comment_lines, strip_imports, process_notebook, SKIP_PATTERNS

import pytest
import tempfile


# --- unit tests for stripping helpers ---

def test_strip_comment_lines_removes_hash_lines():
    src = "# comment\ndef foo():\n    pass\n# another"
    assert strip_comment_lines(src) == "def foo():\n    pass"

def test_strip_comment_lines_keeps_inline_comments():
    src = "x = 1  # inline\ndef foo(): pass"
    result = strip_comment_lines(src)
    assert "x = 1  # inline" in result

def test_strip_imports_removes_import_lines():
    src = "import torch\nfrom torch import nn\ndef foo(): pass"
    assert strip_imports(src) == "def foo(): pass"

def test_strip_imports_keeps_non_import_lines():
    src = "x = 1\ny = 2"
    assert strip_imports(src) == "x = 1\ny = 2"

def test_strip_order_comment_then_import():
    # Backend does strip_imports(strip_comment_lines(src))
    src = "# ✅ SOLUTION\nimport torch\ndef relu(x): return x"
    result = strip_imports(strip_comment_lines(src))
    assert result == "def relu(x): return x"


# --- process_notebook tests using synthetic .ipynb ---

def make_notebook(cells):
    """Build a minimal .ipynb dict."""
    return {
        "cells": [
            {"cell_type": ct, "source": list(src) if isinstance(src, str) else src}
            for ct, src in cells
        ]
    }

def write_notebook(tmp_path, cells):
    nb = make_notebook(cells)
    p = tmp_path / "test_solution.ipynb"
    p.write_text(json.dumps(nb), encoding="utf-8")
    return p


def test_process_notebook_solution_cell_classified(tmp_path):
    p = write_notebook(tmp_path, [
        ("code", "# ✅ SOLUTION\ndef relu(x):\n    return x"),
    ])
    cells = process_notebook(p)
    assert len(cells) == 1
    assert cells[0]["role"] == "solution"
    assert "def relu" in cells[0]["source"]


def test_process_notebook_demo_cell_classified(tmp_path):
    p = write_notebook(tmp_path, [
        ("code", "# ✅ SOLUTION\ndef relu(x): return x"),
        ("code", "# Verify\nx = relu(1)"),
    ])
    cells = process_notebook(p)
    assert cells[0]["role"] == "solution"
    assert cells[1]["role"] == "demo"


def test_process_notebook_markdown_is_explanation(tmp_path):
    p = write_notebook(tmp_path, [
        ("markdown", "# ReLU\nSome explanation."),
        ("code", "# ✅ SOLUTION\ndef relu(x): return x"),
    ])
    cells = process_notebook(p)
    assert cells[0]["role"] == "explanation"
    assert cells[0]["type"] == "markdown"


def test_process_notebook_skips_boilerplate(tmp_path):
    p = write_notebook(tmp_path, [
        ("markdown", "[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)]"),
        ("code", "import google.colab\nget_ipython().run_line_magic('pip', 'install torch-judge')"),
        ("code", "from torch_judge import check\ncheck('relu')"),
        ("code", "# ✅ SOLUTION\ndef relu(x): return x"),
    ])
    cells = process_notebook(p)
    assert len(cells) == 1
    assert cells[0]["role"] == "solution"


def test_process_notebook_skips_empty_cells(tmp_path):
    p = write_notebook(tmp_path, [
        ("code", "   \n  "),
        ("code", "# ✅ SOLUTION\ndef relu(x): return x"),
    ])
    cells = process_notebook(p)
    assert len(cells) == 1


def test_process_notebook_skips_cells_empty_after_stripping(tmp_path):
    # A cell that is only imports + comments becomes empty after stripping
    p = write_notebook(tmp_path, [
        ("code", "# just a comment\nimport torch"),
        ("code", "# ✅ SOLUTION\ndef relu(x): return x"),
    ])
    cells = process_notebook(p)
    assert len(cells) == 1
    assert cells[0]["role"] == "solution"


def test_process_notebook_strips_imports_from_solution(tmp_path):
    p = write_notebook(tmp_path, [
        ("code", "# ✅ SOLUTION\nimport torch\nfrom torch import nn\ndef relu(x): return x"),
    ])
    cells = process_notebook(p)
    assert "import" not in cells[0]["source"]
    assert "def relu" in cells[0]["source"]


# --- integration: verify solutions.json has 68 entries and correct shape ---

SOLUTIONS_JSON = Path(__file__).parent.parent / "web" / "src" / "lib" / "solutions.json"

@pytest.mark.skipif(not SOLUTIONS_JSON.exists(), reason="solutions.json not generated yet")
def test_solutions_json_has_68_entries():
    data = json.loads(SOLUTIONS_JSON.read_text())
    assert len(data) == 68


@pytest.mark.skipif(not SOLUTIONS_JSON.exists(), reason="solutions.json not generated yet")
def test_solutions_json_relu_shape():
    data = json.loads(SOLUTIONS_JSON.read_text())
    assert "relu" in data
    cells = data["relu"]["cells"]
    assert any(c["role"] == "solution" for c in cells)
    for c in cells:
        assert "type" in c and "source" in c and "role" in c
        assert c["role"] in ("solution", "demo", "explanation")


@pytest.mark.skipif(not SOLUTIONS_JSON.exists(), reason="solutions.json not generated yet")
def test_solutions_json_no_boilerplate_in_sources():
    data = json.loads(SOLUTIONS_JSON.read_text())
    for task_id, entry in data.items():
        for c in entry["cells"]:
            for pattern in SKIP_PATTERNS:
                assert pattern not in c["source"], f"{task_id}: boilerplate '{pattern}' found in cell"


@pytest.mark.skipif(not SOLUTIONS_JSON.exists(), reason="solutions.json not generated yet")
def test_solutions_json_every_task_has_solution_cell():
    data = json.loads(SOLUTIONS_JSON.read_text())
    missing = [tid for tid, entry in data.items() if not any(c["role"] == "solution" for c in entry["cells"])]
    assert missing == [], f"Tasks missing solution cell: {missing}"
