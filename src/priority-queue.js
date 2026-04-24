/**
 * 优先队列实现
 * 基于最小堆，支持优先级排序
 * 
 * @module PriorityQueue
 */

class PriorityQueue {
  constructor(compareFn = null) {
    this.heap = [];
    this.compare = compareFn || ((a, b) => a.priority - b.priority);
  }

  /**
   * 获取队列大小
   * @returns {number}
   */
  get size() {
    return this.heap.length;
  }

  /**
   * 检查队列是否为空
   * @returns {boolean}
   */
  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * 查看队首元素（不移除）
   * @returns {any}
   */
  peek() {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * 入队
   * @param {any} item - 元素
   * @returns {number} 队列新大小
   */
  push(item) {
    this.heap.push(item);
    this._heapifyUp(this.heap.length - 1);
    return this.heap.length;
  }

  /**
   * 出队
   * @returns {any} 队首元素
   */
  pop() {
    if (this.heap.length === 0) {
      return null;
    }
    
    if (this.heap.length === 1) {
      return this.heap.pop();
    }
    
    const root = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._heapifyDown(0);
    
    return root;
  }

  /**
   * 移除指定元素
   * @param {Function} predicate - 匹配函数
   * @returns {boolean} 是否成功移除
   */
  remove(predicate) {
    const index = this.heap.findIndex(predicate);
    if (index === -1) {
      return false;
    }
    
    if (index === this.heap.length - 1) {
      this.heap.pop();
      return true;
    }
    
    this.heap[index] = this.heap.pop();
    
    // 重新调整堆
    const parentIndex = this._parent(index);
    if (index > 0 && this.compare(this.heap[index], this.heap[parentIndex]) < 0) {
      this._heapifyUp(index);
    } else {
      this._heapifyDown(index);
    }
    
    return true;
  }

  /**
   * 查找元素
   * @param {Function} predicate - 匹配函数
   * @returns {any}
   */
  find(predicate) {
    return this.heap.find(predicate);
  }

  /**
   * 过滤元素
   * @param {Function} predicate - 过滤函数
   * @returns {Array}
   */
  filter(predicate) {
    return this.heap.filter(predicate);
  }

  /**
   * 遍历队列
   * @param {Function} callback - (item, index) => void
   */
  forEach(callback) {
    this.heap.forEach(callback);
  }

  /**
   * 转换为数组
   * @returns {Array}
   */
  toArray() {
    return [...this.heap];
  }

  /**
   * 清空队列
   */
  clear() {
    this.heap = [];
  }

  /**
   * 获取父节点索引
   * @private
   */
  _parent(index) {
    return Math.floor((index - 1) / 2);
  }

  /**
   * 获取左子节点索引
   * @private
   */
  _leftChild(index) {
    return 2 * index + 1;
  }

  /**
   * 获取右子节点索引
   * @private
   */
  _rightChild(index) {
    return 2 * index + 2;
  }

  /**
   * 向上调整堆
   * @private
   */
  _heapifyUp(index) {
    let current = index;
    
    while (current > 0) {
      const parent = this._parent(current);
      
      if (this.compare(this.heap[current], this.heap[parent]) < 0) {
        this._swap(current, parent);
        current = parent;
      } else {
        break;
      }
    }
  }

  /**
   * 向下调整堆
   * @private
   */
  _heapifyDown(index) {
    let current = index;
    const length = this.heap.length;
    
    while (true) {
      const left = this._leftChild(current);
      const right = this._rightChild(current);
      let smallest = current;
      
      if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      
      if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }
      
      if (smallest !== current) {
        this._swap(current, smallest);
        current = smallest;
      } else {
        break;
      }
    }
  }

  /**
   * 交换两个元素
   * @private
   */
  _swap(i, j) {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }
}

module.exports = PriorityQueue;
