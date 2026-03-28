/* eslint-disable react/prop-types */
const HomeScreen = ({ onUploadClick, onListClick }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 bg-slate-950 text-slate-100 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">AIHUB</h1>
        <p className="text-slate-400 text-sm max-w-md">
          Upload PDF or images (JPG, PNG), review them alongside prompts, and run OpenAI completions.
          Text PDFs use extraction; scanned PDFs and images use vision. Data is stored in local JSON
          files on the server.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
        <button
          type="button"
          onClick={onUploadClick}
          className="flex-1 rounded-lg px-4 py-3 text-sm font-semibold bg-indigo-500 text-white shadow hover:bg-indigo-400 transition-colors"
        >
          Upload new file
        </button>
        <button
          type="button"
          onClick={onListClick}
          className="flex-1 rounded-lg px-4 py-3 text-sm font-semibold border border-slate-600 text-slate-100 hover:bg-slate-800 transition-colors"
        >
          See all files
        </button>
      </div>
    </div>
  );
};

export default HomeScreen;
