import py_compile

with open('scripts/paper_data.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if line.strip() == ']' and i > 0:
        prev = lines[i-1]
        if 'directly to transactional deed analysis' in prev or \
           'deterministic span extraction' in prev or \
           'deviating from verified source evidence' in prev:
            new_lines.append('                    )\n')
    new_lines.append(line)

with open('scripts/paper_data.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

try:
    py_compile.compile('scripts/paper_data.py', doraise=True)
    print('paper_data.py compiled successfully!')
except Exception as e:
    print('Compilation error:', e)
