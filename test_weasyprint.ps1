$env:Path = "C:\msys64\mingw64\bin;" + $env:Path
$env:WEASYPRINT_DLL_DIRECTORIES = "C:\msys64\mingw64\bin"
D:\Anaconda\python.exe -c "import weasyprint; print('WeasyPrint OK')"
