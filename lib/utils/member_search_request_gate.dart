/// Keeps asynchronous member-search results tied to the query that started
/// them. A response from an older query must never replace newer results.
class MemberSearchRequestGate {
  int _generation = 0;

  MemberSearchRequest begin(String query) {
    _generation += 1;
    return MemberSearchRequest._(_generation, query);
  }

  void invalidate() {
    _generation += 1;
  }

  bool accepts(MemberSearchRequest request, String activeQuery) {
    return request._generation == _generation && request.query == activeQuery;
  }
}

class MemberSearchRequest {
  final int _generation;
  final String query;

  const MemberSearchRequest._(this._generation, this.query);
}
