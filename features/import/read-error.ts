export function describeStatementReadError(cause: unknown, fileName: string) {
  const chunkLoadFailed =
    cause instanceof Error &&
    (cause.name === 'ChunkLoadError' ||
      /Failed to load chunk|Loading chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
        cause.message,
      ));

  if (chunkLoadFailed) {
    const lowerName = fileName.toLocaleLowerCase('ru');
    const format = lowerName.endsWith('.pdf')
      ? 'PDF'
      : lowerName.endsWith('.xlsx')
        ? 'XLSX'
        : 'файла';
    return {
      message: `Не удалось загрузить модуль чтения ${format}. Проверьте интернет, обновите приложение и выберите файл снова.`,
      reloadSuggested: true,
    };
  }

  return {
    message:
      cause instanceof Error ? cause.message : 'Не удалось прочитать файл.',
    reloadSuggested: false,
  };
}
