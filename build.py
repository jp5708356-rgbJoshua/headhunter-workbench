from pathlib import Path
import re
root=Path(__file__).resolve().parent
text=(root/'template.html').read_text()
def embed(content):
 return re.sub(r'</script',lambda m:'<'+chr(92)+m.group()[1:],content,flags=re.IGNORECASE)
inputs=[('/*__STYLE__*/','styles.css'),('/*__CORE__*/','core.js'),('/*__DATA__*/','data.js'),('/*__STORE__*/','storage.js'),('/*__REGISTRY__*/','modules.js'),('/*__SEED__*/','seed.js'),('/*__APP__*/','app.js')]
for marker,name in inputs:
 content=embed((root/'dist'/name).read_text())
 text=text.replace(marker,content)
modules='\n'.join(p.read_text() for p in sorted((root/'dist/modules').glob('*.js')))
text=text.replace('/*__MODULES__*/',embed(modules))
(root/'dist/index.html').write_text(text)
print('Built standalone dist/index.html')
