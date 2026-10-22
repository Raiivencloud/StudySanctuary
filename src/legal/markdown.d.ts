// Vite "?raw" imports: the file content as a string (legal texts)
declare module '*.md?raw' {
  const content: string;
  export default content;
}
