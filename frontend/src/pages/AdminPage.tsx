import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, RefreshCw, Eye, CheckCircle, XCircle, AlertTriangle, FileSpreadsheet, File as FileIcon, FileType2 } from 'lucide-react';

interface SourceFile {
  id: string;
  originalFileName: string;
  fileType: string;
  uploadedAt: string;
  updatedAt: string;
  status: 'active' | 'inactive';
  parseStatus: 'pending' | 'processing' | 'success' | 'error';
  parseMessage: string;
  product: string;
  pm: string;
  documentType: string;
}

export default function AdminPage() {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [viewMode, setViewMode] = useState<'all' | 'pm' | 'product' | 'documentType'>('all');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({ product: '', pm: '', documentType: '' });
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [fileDetails, setFileDetails] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles();
    const interval = setInterval(fetchFiles, 5000); // Poll for updates
    return () => clearInterval(interval);
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      if (!res.ok) {
        const text = await res.text();
        console.error(`Fetch failed with status ${res.status}: ${text.substring(0, 100)}`);
        return;
      }
      const data = await res.json();
      setFiles(data);
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setIsMetadataModalOpen(true);
  };

  const performUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setIsMetadataModalOpen(false);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('product', metadata.product);
    formData.append('pm', metadata.pm);
    formData.append('documentType', metadata.documentType);

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        let errMsg = 'Upload failed';
        try {
          const errorData = await res.json();
          errMsg = errorData?.error ?? errorData?.message ?? errMsg;
        } catch {
          const text = await res.text().catch(() => '');
          if (text) errMsg = text.substring(0, 200);
        }
        throw new Error(errMsg);
      }
      fetchFiles();
      setMetadata({ product: '', pm: '', documentType: '' });
      setSelectedFile(null);
    } catch (error) {
      console.error('Upload failed:', error);
      setErrorMsg(error instanceof Error ? `檔案上傳失敗: ${error.message}` : '檔案上傳失敗，請檢查格式或網路連線。');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    try {
      const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        let errMsg = 'Delete failed';
        try {
          const errorData = await res.json();
          errMsg = errorData?.error ?? errorData?.message ?? errMsg;
        } catch {
          const text = await res.text().catch(() => '');
          if (text) errMsg = text.substring(0, 200);
        }
        throw new Error(errMsg);
      }
      if (selectedFileId === id) setSelectedFileId(null);
      fetchFiles();
    } catch (error) {
      console.error('Delete failed:', error);
      setErrorMsg(error instanceof Error ? `刪除失敗: ${error.message}` : '刪除檔案失敗。');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await fetch(`/api/files/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchFiles();
    } catch (error) {
      console.error('Status toggle failed:', error);
    }
  };

  const handleViewDetails = async (id: string) => {
    setSelectedFileId(id);
    try {
      const res = await fetch(`/api/files/${id}/details`);
      if (!res.ok) {
        const text = await res.text();
        console.error(`Fetch details failed with status ${res.status}: ${text.substring(0, 100)}`);
        return;
      }
      const data = await res.json();
      setFileDetails(data);
    } catch (error) {
      console.error('Failed to fetch details:', error);
    }
  };

  const getFileIcon = (ext: string) => {
    if (ext.includes('xls')) return <FileSpreadsheet className="text-green-600" />;
    if (ext.includes('doc')) return <FileText className="text-blue-600" />;
    if (ext.includes('pdf')) return <FileIcon className="text-red-600" />;
    if (ext.includes('ppt')) return <FileType2 className="text-orange-600" />;
    return <FileText className="text-gray-600" />;
  };

  const renderFileItem = (file: SourceFile) => (
    <li 
      key={file.id} 
      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedFileId === file.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'}`}
      onClick={() => handleViewDetails(file.id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          {getFileIcon(file.fileType)}
          <div>
            <p className="text-sm font-medium text-gray-900 truncate w-48" title={file.originalFileName}>
              {file.originalFileName}
            </p>
            <div className="flex items-center mt-1 space-x-2 text-xs text-gray-500">
              <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
              <span>•</span>
              <span className={`${
                file.parseStatus === 'success' ? 'text-emerald-600' : 
                file.parseStatus === 'error' ? 'text-red-600' : 'text-amber-600'
              }`}>
                {file.parseStatus === 'success' ? '解析成功' : 
                 file.parseStatus === 'error' ? '解析失敗' : '解析中...'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-end space-y-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleStatus(file.id, file.status); }}
            className={`px-2 py-1 text-xs rounded-full font-medium ${
              file.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {file.status === 'active' ? '啟用中' : '已停用'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }}
            className="text-red-500 hover:text-red-700 p-1"
            title="刪除"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </li>
  );

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden relative">
      {/* Sidebar: File List */}
      <div className="w-1/3 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">資料來源管理</h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {isUploading ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
              <span>上傳</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".xlsx,.xls,.doc,.docx,.pdf,.ppt,.pptx"
            />
          </div>
          <select value={viewMode} onChange={e => setViewMode(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
            <option value="all">全部檔案</option>
            <option value="pm">依 PM 瀏覽</option>
            <option value="product">依產品瀏覽</option>
            <option value="documentType">依文件類型瀏覽</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {files.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>尚無資料來源，請上傳檔案。</p>
            </div>
          ) : (
            (() => {
              const groups: Record<string, SourceFile[]> = {};
              if (viewMode === 'all') {
                return (
                  <ul className="divide-y divide-gray-100">
                    {files.map(file => renderFileItem(file))}
                  </ul>
                );
              }
              
              files.forEach(file => {
                const key = viewMode === 'pm' ? file.pm : viewMode === 'product' ? file.product : file.documentType;
                const groupKey = key || '未分類';
                if (!groups[groupKey]) groups[groupKey] = [];
                groups[groupKey].push(file);
              });

              return Object.entries(groups).sort().map(([group, groupFiles]) => (
                <div key={group}>
                  <div className="bg-gray-100 px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wider">
                    {group} ({groupFiles.length})
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {groupFiles.map(file => renderFileItem(file))}
                  </ul>
                </div>
              ));
            })()
          )}
        </div>
      </div>

      {/* Main Content: Details & Verification Panel */}
      <div className="flex-1 bg-white overflow-y-auto">
        {selectedFileId && fileDetails ? (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                {getFileIcon(fileDetails.file.fileType)}
                <span className="ml-3">{fileDetails.file.originalFileName}</span>
              </h2>
              <div className="text-sm text-gray-500">
                最後更新: {new Date(fileDetails.file.updatedAt).toLocaleString()}
              </div>
            </div>

            {/* Verification Panel */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <CheckCircle className="text-blue-600 mr-2" size={20} />
                解析驗證面板
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">原始 Chunks</p>
                  <p className="text-2xl font-bold text-gray-900">{fileDetails.chunks.length}</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">報價紀錄 (Quote)</p>
                  <p className="text-2xl font-bold text-emerald-600">{fileDetails.quotes.length}</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">優惠紀錄 (Promo)</p>
                  <p className="text-2xl font-bold text-purple-600">{fileDetails.promotions.length}</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">PM 紀錄</p>
                  <p className="text-2xl font-bold text-blue-600">{fileDetails.pms.length}</p>
                </div>
              </div>

              {fileDetails.issues.length > 0 && (
                <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-800 flex items-center mb-2">
                    <AlertTriangle size={16} className="mr-1 text-amber-500" />
                    解析資訊與警告 ({fileDetails.issues.length})
                  </h4>
                  <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                    {fileDetails.issues.map((issue: any) => (
                      <li key={issue.id} className={issue.severity === 'error' ? 'text-red-600' : issue.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}>
                        {issue.message} ({issue.citation})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Extracted Records Tabs/Sections */}
            <div className="space-y-8">
              
              {/* Quotes */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Product Quotes ({fileDetails.quotes.length})</h3>
                {fileDetails.quotes.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Product Name</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">SKU</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Quote Value</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Citation</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {fileDetails.quotes.map((q: any) => (
                          <tr key={q.id}>
                            <td className="px-4 py-2 font-medium text-gray-900">{q.productName}</td>
                            <td className="px-4 py-2 text-gray-500">{q.sku}</td>
                            <td className="px-4 py-2 text-emerald-600 font-medium">{q.quoteValue}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{q.citation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-gray-500">無報價資料</p>}
              </div>

              {/* Promotions */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Promotions ({fileDetails.promotions.length})</h3>
                {fileDetails.promotions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Product Name</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">SKU</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Promotion</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Citation</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {fileDetails.promotions.map((p: any) => (
                          <tr key={p.id}>
                            <td className="px-4 py-2 font-medium text-gray-900">{p.productName}</td>
                            <td className="px-4 py-2 text-gray-500">{p.sku}</td>
                            <td className="px-4 py-2 text-purple-600">{p.promotionTitle}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{p.citation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-gray-500">無優惠資料</p>}
              </div>

              {/* PMs */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Product Managers ({fileDetails.pms.length})</h3>
                {fileDetails.pms.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Product Name</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">SKU</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">PM Name</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Citation</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {fileDetails.pms.map((p: any) => (
                          <tr key={p.id}>
                            <td className="px-4 py-2 font-medium text-gray-900">{p.productName}</td>
                            <td className="px-4 py-2 text-gray-500">{p.sku}</td>
                            <td className="px-4 py-2 text-blue-600">{p.pmName}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{p.citation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-gray-500">無 PM 資料</p>}
              </div>

            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <Eye size={48} className="mx-auto mb-4 opacity-20" />
              <p>請從左側選擇檔案以查看解析結果與驗證面板</p>
            </div>
          </div>
        )}
      </div>

      {/* Metadata Collection Modal */}
      {isMetadataModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">檔案 Metadata 設定</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">關聯產品</label>
                <input type="text" value={metadata.product} onChange={e => setMetadata({...metadata, product: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="例如: iPhone 15" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">關聯 PM</label>
                <select 
                  value={metadata.pm} 
                  onChange={e => setMetadata({...metadata, pm: e.target.value})} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">請選擇 PM</option>
                  <option value="謝東曉">謝東曉</option>
                  <option value="劉宇琪">劉宇琪</option>
                  <option value="李育萱">李育萱</option>
                  <option value="顏鴻旭">顏鴻旭</option>
                  <option value="張育瑄">張育瑄</option>
                  <option value="吳培毅">吳培毅</option>
                  <option value="詹雅筑">詹雅筑</option>
                  <option value="何蕙廷">何蕙廷</option>
                  <option value="邱彥彰">邱彥彰</option>
                  <option value="楊雁婷">楊雁婷</option>
                  <option value="馮夢麒">馮夢麒</option>
                  <option value="莊雅雲">莊雅雲</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">文件類型</label>
                <select value={metadata.documentType} onChange={e => setMetadata({...metadata, documentType: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="">請選擇</option>
                  <option value="quote">報價單</option>
                  <option value="promotion">優惠方案</option>
                  <option value="manual">產品手冊</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setIsMetadataModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={performUpload} disabled={!metadata.product || !metadata.pm || !metadata.documentType} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">上傳</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">確認刪除</h3>
            <p className="text-gray-600 mb-6">確定要刪除此檔案及其所有解析資料嗎？此動作無法復原。</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {errorMsg && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center animate-in fade-in slide-in-from-bottom-4">
          <AlertTriangle size={20} className="mr-2" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-4 hover:opacity-80">
            <XCircle size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
