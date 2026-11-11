"""Cria a entrega Hostinger com uma lista explícita de arquivos públicos/privados de código.
Exclui por construção CSV, config.php, banco, dados escolares, testes e node_modules.
"""
import hashlib,pathlib,zipfile
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'dist';out.mkdir(exist_ok=True)
files=[]
for folder in ['app','public','docs']:
    files.extend(p for p in (root/folder).rglob('*') if p.is_file())
for relative in ['.htaccess','config.example.php','install.php','README.md','storage/.htaccess','storage/.gitkeep','scripts/check.php','scripts/backup.php']:
    files.append(root/relative)
target=out/'MarioProvas-hostinger.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
    for f in sorted(files):
        relative=f.relative_to(root).as_posix()
        assert not relative.endswith(('.csv','.sqlite','.db')) and relative!='config.php'
        archive.write(f,relative)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert 'public/index.php' in archive.namelist() and 'app/schema.sql' in archive.namelist()
print('Pacote:',target.name,'| arquivos:',len(files),'| bytes:',target.stat().st_size)
print('SHA-256:',hashlib.sha256(target.read_bytes()).hexdigest())
