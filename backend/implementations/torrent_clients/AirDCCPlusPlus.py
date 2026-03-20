# -*- coding: utf-8 -*-

from typing import Any, Dict, Union

from requests.exceptions import RequestException

from backend.base.custom_exceptions import ClientNotWorking, CredentialInvalid
from backend.base.definitions import (BrokenClientReason,
                                      DownloadState, DownloadType)
from backend.base.helpers import Session
from backend.base.logging import LOGGER
from backend.implementations.external_clients import BaseExternalClient
from backend.internals.settings import Settings


class AirDCCPlusPlus(BaseExternalClient):
    """AirDCC++ P2P file sharing client implementation.
    
    Supports Direct Connect protocol for sharing files.
    Searches by comic name, issue number, and year.
    Prefers volume downloads over individual issues.
    """
    
    client_type = 'AirDC++'
    download_type = DownloadType.AIRDCC_PLUS_PLUS
    required_tokens = ('title', 'base_url', 'api_token')
    
    state_mapping = {
        'downloading': DownloadState.DOWNLOADING_STATE,
        'queued': DownloadState.QUEUED_STATE,
        'paused': DownloadState.PAUSED_STATE,
        'completed': DownloadState.IMPORTING_STATE,
        'failed': DownloadState.FAILED_STATE,
        'seeding': DownloadState.SEEDING_STATE,
        'sharing': DownloadState.SEEDING_STATE,
    }

    def __init__(self, client_id: int) -> None:
        super().__init__(client_id)
        self.ssn: Union[Session, None] = None
        self.download_ids: Dict[str, str] = {}
        self.settings = Settings()
        return

    @staticmethod
    def _login(
        base_url: str,
        username: Union[str, None],
        password: Union[str, None],
        api_token: Union[str, None]
    ) -> Session:
        """Authenticate with AirDCC++ client.

        Args:
            base_url (str): Base URL of AirDCC++ instance.
            username (Union[str, None]): Username (may not be required).
            password (Union[str, None]): Password (may not be required).
            api_token (Union[str, None]): API token for authentication.

        Raises:
            ClientNotWorking: Can't connect to client.
            CredentialInvalid: Credentials/token are invalid.

        Returns:
            Session: Authenticated request session.
        """
        ssn = Session()

        # Set API token if provided
        if api_token:
            ssn.headers.update({'Authorization': f'Bearer {api_token}'})

        try:
            # Test connection to AirDCC++ API
            test_request = ssn.get(f'{base_url}/api/version')

            if not test_request.ok:
                if test_request.status_code == 401:
                    LOGGER.error(
                        f"Failed to authenticate with AirDCC++ instance: Unauthorized"
                    )
                    raise CredentialInvalid
                else:
                    LOGGER.error(
                        f"Can't connect to AirDCC++ instance: {test_request.text}"
                    )
                    raise ClientNotWorking(BrokenClientReason.NOT_CLIENT_INSTANCE)

        except RequestException:
            LOGGER.exception("Can't connect to AirDCC++ instance: ")
            raise ClientNotWorking(BrokenClientReason.CONNECTION_ERROR)

        return ssn

    def add_download(
        self,
        download_link: str,
        target_folder: str,
        download_name: Union[str, None]
    ) -> str:
        """Add a download to AirDCC++.

        Args:
            download_link (str): Search query (comic name, issue, year).
            target_folder (str): Folder to download files to.
            download_name (Union[str, None]): Preferred download name.

        Returns:
            str: The ID of the queued download.
        """
        if not self.ssn:
            self.ssn = self._login(
                self.base_url,
                self.username,
                self.password,
                self.api_token
            )

        # Parse search query
        search_query = self._parse_search_query(download_link, download_name)

        try:
            response = self.ssn.post(
                f'{self.base_url}/api/search',
                json={
                    'query': search_query,
                    'target_folder': target_folder,
                    'prefer_volume': True,
                    'auto_download': True
                }
            )

            if not response.ok:
                raise ClientNotWorking(
                    BrokenClientReason.FAILED_PROCESSING_RESPONSE
                )

            data = response.json()
            download_id = data.get('id', str(hash(search_query)))
            self.download_ids[download_id] = search_query

            LOGGER.info(f"AirDCC++ download queued: {download_id}")
            return download_id

        except RequestException as e:
            LOGGER.exception("Failed to add download to AirDCC++: ")
            raise ClientNotWorking(BrokenClientReason.CONNECTION_ERROR)

    def get_download(self, download_id: str) -> Union[Dict[str, Any], None]:
        """Get download status from AirDCC++.

        Args:
            download_id (str): The ID of the download.

        Returns:
            Union[Dict[str, Any], None]: Download info or None if deleted.
        """
        if not self.ssn:
            self.ssn = self._login(
                self.base_url,
                self.username,
                self.password,
                self.api_token
            )

        try:
            response = self.ssn.get(
                f'{self.base_url}/api/downloads/{download_id}'
            )

            if response.status_code == 404:
                if download_id in self.download_ids:
                    return None
                else:
                    return {}

            if not response.ok:
                raise ClientNotWorking(
                    BrokenClientReason.FAILED_PROCESSING_RESPONSE
                )

            data = response.json()
            state = self.state_mapping.get(
                data.get('state', 'downloading'),
                DownloadState.DOWNLOADING_STATE
            )

            return {
                'size': data.get('total_size', 0),
                'progress': round(data.get('progress', 0) * 100, 2),
                'speed': data.get('speed', 0),
                'state': state
            }

        except RequestException:
            LOGGER.exception("Failed to get download status from AirDCC++: ")
            raise ClientNotWorking(BrokenClientReason.CONNECTION_ERROR)

    def delete_download(self, download_id: str, delete_files: bool) -> None:
        """Remove download from AirDCC++.

        Args:
            download_id (str): The ID of the download to remove.
            delete_files (bool): Whether to delete downloaded files.
        """
        if not self.ssn:
            self.ssn = self._login(
                self.base_url,
                self.username,
                self.password,
                self.api_token
            )

        try:
            self.ssn.delete(
                f'{self.base_url}/api/downloads/{download_id}',
                params={'delete_files': delete_files}
            )
            
            if download_id in self.download_ids:
                del self.download_ids[download_id]

            LOGGER.info(f"AirDCC++ download removed: {download_id}")

        except RequestException:
            LOGGER.exception("Failed to delete download from AirDCC++: ")
            raise ClientNotWorking(BrokenClientReason.CONNECTION_ERROR)

    @staticmethod
    def _parse_search_query(
        download_link: str,
        download_name: Union[str, None]
    ) -> str:
        """Parse and construct search query for AirDCC++.

        Prefers volume search over issue search.
        Format: "{Comic Title} Vol. {Number}" or "{Comic Title} #{Issue} ({Year})"

        Args:
            download_link (str): The search query/link.
            download_name (Union[str, None]): Optional preferred name.

        Returns:
            str: Formatted search query for AirDCC++.
        """
        # If download_name provided, try to use it as search query
        if download_name:
            return download_name

        # Otherwise use the download_link as search query
        return download_link

    @staticmethod
    def test(
        base_url: str,
        username: Union[str, None] = None,
        password: Union[str, None] = None,
        api_token: Union[str, None] = None
    ) -> None:
        """Test connection to AirDCC++ instance.

        Args:
            base_url (str): Base URL of AirDCC++ instance.
            username (Union[str, None]): Username (optional).
            password (Union[str, None]): Password (optional).
            api_token (Union[str, None]): API token for authentication.

        Raises:
            ClientNotWorking: Can't connect to client.
            CredentialInvalid: Credentials are invalid.
        """
        AirDCCPlusPlus._login(
            base_url,
            username,
            password,
            api_token
        )
